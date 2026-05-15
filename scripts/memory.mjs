import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { extname, relative, resolve } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, appendJsonl, nowIso, looksLikeSecretText } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "search";
const json = hasFlag(args, "--json");
const memoryFile = pathFromRoot("state", "memory", "entries.jsonl");
const allowedKinds = new Set(["rule", "fact", "decision", "pattern", "warning"]);
const allowedConfidence = new Set(["low", "medium", "high"]);
const forbiddenImportPath = /(^|[/\\])(?:\.env[^/\\]*|\.npmrc|\.netrc|\.ssh|\.pi-agent|\.gemini|\.codex|\.claude)(?:[/\\]|$)|(?:auth|token|credential)s?(?:\.json)?$/i;

if (command === "add") {
  const entry = buildEntry({
    kind: parseFlag(args, "--kind", "fact"),
    text: requiredFlag("--text"),
    source: requiredFlag("--source"),
    scope: parseFlag(args, "--scope", "global"),
    confidence: parseFlag(args, "--confidence", "medium"),
    tags: parseTags(parseFlag(args, "--tags", "")),
    taskId: parseFlag(args, "--task", ""),
    expiresAt: parseFlag(args, "--expires-at", ""),
  });
  const findings = validateEntry(entry);
  if (findings.length) printResult({ ok: false, entry, findings }, json, "memory add");
  appendJsonl(memoryFile, entry);
  output({ ok: true, entry, findings: [] }, "memory added");
}

if (command === "import") {
  const file = safeImportPath(requiredFlag("--file"));
  const source = requiredFlag("--source");
  const defaultKind = parseFlag(args, "--kind", "fact");
  const defaultScope = parseFlag(args, "--scope", "global");
  const defaultConfidence = parseFlag(args, "--confidence", "medium");
  const defaultTags = parseTags(parseFlag(args, "--tags", "imported"));
  const taskId = parseFlag(args, "--task", "");
  const dryRun = hasFlag(args, "--dry-run");
  const candidates = parseImportFile(file).map((candidate) => buildEntry({
    kind: candidate.kind || defaultKind,
    text: candidate.text,
    source: candidate.source || source,
    scope: candidate.scope || defaultScope,
    confidence: candidate.confidence || defaultConfidence,
    tags: unique([...(candidate.tags || []), ...defaultTags]),
    taskId: candidate.taskId || taskId,
    expiresAt: candidate.expiresAt || "",
  }));
  const existingTexts = new Set(readEntries().entries.map((entry) => normalizeText(entry.text)));
  const imported = [];
  const skipped = [];
  const findings = [];
  for (const entry of candidates) {
    const entryFindings = validateEntry(entry);
    if (entryFindings.length) {
      findings.push(...entryFindings);
      skipped.push({ text: entry.text, reason: "invalid" });
      continue;
    }
    const key = normalizeText(entry.text);
    if (existingTexts.has(key)) {
      skipped.push({ text: entry.text, reason: "duplicate" });
      continue;
    }
    existingTexts.add(key);
    imported.push(entry);
  }
  if (findings.length) printResult({ ok: false, imported: [], skipped, findings }, json, "memory import");
  if (!dryRun) {
    for (const entry of imported) appendJsonl(memoryFile, entry);
  }
  output({ ok: true, dryRun, file: relative(pathFromRoot(), file), imported, skipped, findings: [] }, "memory import");
}

if (command === "search") {
  const query = parseFlag(args, "--query", args[1] || "").trim();
  if (!query) printResult({ ok: false, findings: ["missing --query"] }, json, "memory search");
  const limit = Number(parseFlag(args, "--limit", "10")) || 10;
  const kind = parseFlag(args, "--kind", "");
  const scope = parseFlag(args, "--scope", "");
  const tags = parseTags(parseFlag(args, "--tags", ""));
  const includeStale = hasFlag(args, "--include-stale");
  const ranked = readEntries().entries
    .filter((entry) => includeStale || !isExpired(entry))
    .filter((entry) => !kind || entry.kind === kind)
    .filter((entry) => !scope || entry.scope === scope)
    .filter((entry) => tags.length === 0 || tags.every((tag) => (entry.tags || []).includes(tag)))
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.entry.createdAt).localeCompare(String(a.entry.createdAt)))
    .slice(0, limit);
  output({
    ok: true,
    query,
    entries: ranked.map((item) => item.entry),
    scores: hasFlag(args, "--scores") ? ranked.map((item) => ({ id: item.entry.id, score: item.score })) : undefined,
    findings: [],
  }, "memory search");
}

if (command === "list") {
  const limit = Number(parseFlag(args, "--limit", "20")) || 20;
  const kind = parseFlag(args, "--kind", "");
  const includeStale = hasFlag(args, "--include-stale");
  const entries = readEntries().entries
    .filter((entry) => includeStale || !isExpired(entry))
    .filter((entry) => !kind || entry.kind === kind)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
  output({ ok: true, entries, findings: [] }, "memory list");
}

if (command === "prune") {
  const dryRun = hasFlag(args, "--dry-run");
  const pruneStale = hasFlag(args, "--stale") || hasFlag(args, "--all") || !hasFlag(args, "--duplicates");
  const pruneDuplicates = hasFlag(args, "--duplicates") || hasFlag(args, "--all");
  const state = readEntries();
  const plan = prunePlan(state.entries, { pruneStale, pruneDuplicates });
  if (!dryRun) writeEntries(plan.keep);
  output({ ok: true, dryRun, pruneStale, pruneDuplicates, removed: plan.remove, kept: plan.keep.length, findings: state.parseFindings }, "memory prune");
}

if (command === "doctor") {
  const { entries, parseFindings } = readEntries();
  const findings = [...parseFindings];
  const stale = [];
  const duplicates = duplicateEntries(entries);
  for (const entry of entries) {
    findings.push(...validateEntry(entry));
    if (isExpired(entry)) stale.push(entry.id);
  }
  output({ ok: findings.length === 0, count: entries.length, stale, duplicates, findings }, "memory doctor");
}

console.error("usage: node scripts/memory.mjs add|import|search|list|prune|doctor [--json] [...]");
process.exit(2);

function buildEntry({ kind, text, source, scope, confidence, tags, taskId, expiresAt }) {
  return {
    id: `mem-${nowIso().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    kind,
    text: String(text || "").trim(),
    source,
    scope,
    confidence,
    tags,
    taskId,
    createdAt: nowIso(),
    expiresAt,
  };
}

function requiredFlag(name) {
  const value = parseFlag(args, name, "");
  if (!value || !String(value).trim()) printResult({ ok: false, findings: [`missing ${name}`] }, json, "memory");
  return String(value);
}

function readEntries() {
  const parseFindings = [];
  if (!existsSync(memoryFile)) return { entries: [], parseFindings };
  const entries = readFileSync(memoryFile, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index: index + 1 }))
    .filter(({ line }) => Boolean(line))
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch {
        parseFindings.push(`entries.jsonl line ${index} is not valid JSON`);
        return null;
      }
    })
    .filter(Boolean);
  return { entries, parseFindings };
}

function writeEntries(entries) {
  writeFileSync(memoryFile, entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : ""), "utf8");
}

function prunePlan(entries, { pruneStale, pruneDuplicates }) {
  const keep = [];
  const remove = [];
  const seen = new Set();
  for (const entry of entries) {
    const reasons = [];
    const key = normalizeText(entry.text);
    if (pruneStale && isExpired(entry)) reasons.push("stale");
    if (pruneDuplicates && seen.has(key)) reasons.push("duplicate");
    if (reasons.length) remove.push({ id: entry.id, reasons, text: entry.text });
    else keep.push(entry);
    seen.add(key);
  }
  return { keep, remove };
}

function duplicateEntries(entries) {
  const firstByText = new Map();
  const duplicates = [];
  for (const entry of entries) {
    const key = normalizeText(entry.text);
    if (firstByText.has(key)) duplicates.push({ id: entry.id, duplicateOf: firstByText.get(key), text: entry.text });
    else firstByText.set(key, entry.id);
  }
  return duplicates;
}

function validateEntry(entry) {
  const findings = [];
  for (const field of ["id", "kind", "text", "source", "scope", "confidence", "createdAt"]) {
    if (!filled(entry[field])) findings.push(`memory ${entry.id || "<missing>"} missing ${field}`);
  }
  if (entry.kind && !allowedKinds.has(entry.kind)) findings.push(`memory ${entry.id || "<missing>"} has invalid kind ${entry.kind}`);
  if (entry.confidence && !allowedConfidence.has(entry.confidence)) findings.push(`memory ${entry.id || "<missing>"} has invalid confidence ${entry.confidence}`);
  if (!Array.isArray(entry.tags)) findings.push(`memory ${entry.id || "<missing>"} tags must be an array`);
  if (entry.expiresAt && Number.isNaN(Date.parse(entry.expiresAt))) findings.push(`memory ${entry.id || "<missing>"} has invalid expiresAt`);
  if (String(entry.text || "").length > 2000) findings.push(`memory ${entry.id || "<missing>"} text is too long`);
  if (looksLikeSecretText(JSON.stringify(entry))) findings.push(`memory ${entry.id || "<missing>"} contains secret-like text`);
  return findings;
}

function scoreEntry(entry, query) {
  const text = String(entry.text || "").toLowerCase();
  const source = String(entry.source || "").toLowerCase();
  const scope = String(entry.scope || "").toLowerCase();
  const tagText = (entry.tags || []).map((tag) => String(tag).toLowerCase());
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const phrase = query.toLowerCase().trim();
  let score = 0;
  if (phrase && text.includes(phrase)) score += 12;
  if (phrase && tagText.includes(phrase)) score += 8;
  for (const term of terms) {
    if (text.includes(term)) score += 4;
    if (tagText.includes(term)) score += 5;
    if (scope.includes(term)) score += 2;
    if (source.includes(term)) score += 1;
  }
  if (terms.length > 1 && terms.every((term) => text.includes(term))) score += 4;
  if (entry.kind === "rule" || entry.kind === "decision") score += 0.5;
  if (entry.confidence === "high") score += 0.75;
  else if (entry.confidence === "medium") score += 0.25;
  score += recencyBoost(entry.createdAt);
  return score;
}

function recencyBoost(createdAt) {
  const parsed = Date.parse(createdAt || "");
  if (Number.isNaN(parsed)) return 0;
  const ageDays = Math.max(0, (Date.now() - parsed) / 86_400_000);
  if (ageDays <= 7) return 0.5;
  if (ageDays <= 30) return 0.25;
  return 0;
}

function parseTags(value) {
  return unique(String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean));
}

function parseImportFile(path) {
  const text = readImportText(path);
  const extension = extname(path).toLowerCase();
  if (extension === ".json") {
    const parsed = JSON.parse(text);
    const values = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(values)) throw new Error("memory import JSON must be an array or { entries: [...] }");
    return values.flatMap(normalizeCandidate);
  }
  if (extension === ".jsonl") {
    return text.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      try {
        return normalizeCandidate(JSON.parse(trimmed));
      } catch {
        return normalizeCandidate(trimmed);
      }
    });
  }
  return text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "---" || trimmed.startsWith("```")) return [];
    const withoutBullet = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
    return normalizeCandidate(withoutBullet);
  });
}

function normalizeCandidate(value) {
  if (typeof value === "string") return value.trim() ? [{ text: value.trim() }] : [];
  if (!value || typeof value !== "object") return [];
  const text = String(value.text || value.memory || value.rule || value.content || "").trim();
  if (!text) return [];
  return [{
    text,
    kind: value.kind,
    source: value.source,
    scope: value.scope,
    confidence: value.confidence,
    tags: Array.isArray(value.tags) ? value.tags.map(String) : parseTags(value.tags || ""),
    taskId: value.taskId,
    expiresAt: value.expiresAt,
  }];
}

function safeImportPath(value) {
  const resolved = resolve(pathFromRoot(), value);
  const root = pathFromRoot();
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || rel === "") printResult({ ok: false, findings: ["memory import file must be inside the harness repository"] }, json, "memory import");
  if (forbiddenImportPath.test(rel)) printResult({ ok: false, findings: [`memory import path is forbidden: ${rel}`] }, json, "memory import");
  if (!existsSync(resolved)) printResult({ ok: false, findings: [`memory import file does not exist: ${rel}`] }, json, "memory import");
  return resolved;
}

function readImportText(path) {
  const text = readFileSync(path, "utf8");
  if (looksLikeSecretText(text)) printResult({ ok: false, findings: ["memory import file contains secret-like text"] }, json, "memory import");
  if (text.length > 256 * 1024) printResult({ ok: false, findings: ["memory import file is too large"] }, json, "memory import");
  return text;
}

function isExpired(entry) {
  return Boolean(entry.expiresAt && Date.parse(entry.expiresAt) < Date.now());
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function output(result, label) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (!result.ok) printResult(result, json, label);
  if (result.entry) console.log(`${label}: ${result.entry.id}`);
  else if (result.imported) console.log(`${label}: ${result.imported.length} imported${result.dryRun ? " (dry-run)" : ""}`);
  else if (result.removed) console.log(`${label}: ${result.removed.length} removed${result.dryRun ? " (dry-run)" : ""}`);
  else if (result.entries) console.log(result.entries.map((entry) => `${entry.id} [${entry.kind}] ${entry.text}`).join("\n") || "No memory entries.");
  else console.log(`ok   ${label}: ${result.count ?? ""}`.trim());
  process.exit(0);
}

function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}
