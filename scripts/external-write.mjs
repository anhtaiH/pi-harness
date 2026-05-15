import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { hasFlag, parseFlag, pathFromRoot, printResult, appendJsonl, ensureDir, nowIso, looksLikeSecretText } from "./lib/harness-state.mjs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const command = args[0] || "doctor";
const json = hasFlag(args, "--json");

if (command === "record") {
  const taskId = requiredFlag("--task");
  const entry = {
    id: `xw-${nowIso().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    taskId,
    provider: requiredFlag("--provider"),
    action: requiredFlag("--action"),
    target: requiredFlag("--target"),
    reason: requiredFlag("--reason"),
    expectedChange: requiredFlag("--expected-change"),
    verification: requiredFlag("--verification"),
    rollback: requiredFlag("--rollback"),
    status: "planned",
    createdAt: nowIso(),
    expiresAt: expiresAt(parseFlag(args, "--ttl-minutes", "60")),
  };
  const findings = validateEntry(entry).filter((finding) => !finding.includes("missing closure"));
  if (containsSecret(entry)) findings.push("intent contains secret-like text");
  if (findings.length) printResult({ ok: false, entry, findings }, json, "external write intent");
  appendJsonl(intentPath(taskId), entry);
  printResult({ ok: true, entry, findings: [] }, json, "external write intent recorded");
}

if (command === "proof") {
  const taskId = requiredFlag("--task");
  const entry = {
    id: `xwp-${nowIso().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    taskId,
    intentId: requiredFlag("--intent"),
    commandOrInspection: requiredFlag("--command"),
    result: requiredFlag("--result"),
    readBack: requiredFlag("--read-back"),
    createdAt: nowIso(),
  };
  const findings = [];
  if (containsSecret(entry)) findings.push("proof contains secret-like text");
  if (!intentById(taskId, entry.intentId)) findings.push(`unknown intent: ${entry.intentId}`);
  if (findings.length) printResult({ ok: false, entry, findings }, json, "external write proof");
  appendJsonl(proofPath(taskId), entry);
  printResult({ ok: true, entry, findings: [] }, json, "external write proof recorded");
}

if (command === "cancel") {
  const taskId = requiredFlag("--task");
  const entry = {
    id: `xwc-${nowIso().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    taskId,
    intentId: requiredFlag("--intent"),
    reason: requiredFlag("--reason"),
    createdAt: nowIso(),
  };
  const findings = [];
  if (containsSecret(entry)) findings.push("cancellation contains secret-like text");
  if (!intentById(taskId, entry.intentId)) findings.push(`unknown intent: ${entry.intentId}`);
  if (findings.length) printResult({ ok: false, entry, findings }, json, "external write cancellation");
  appendJsonl(cancelPath(taskId), entry);
  printResult({ ok: true, entry, findings: [] }, json, "external write cancelled");
}

if (command === "list") {
  const taskId = requiredFlag("--task");
  const result = taskState(taskId);
  printResult({ ok: true, taskId, ...result, findings: [] }, json, "external writes");
}

if (command === "doctor") {
  const taskId = parseFlag(args, "--task", args.find((arg, index) => index > 0 && !arg.startsWith("--")) || "");
  if (!taskId) printResult({ ok: false, findings: ["usage: node scripts/external-write.mjs doctor --task <taskId> [--json]"] }, json, "external write doctor");
  const result = doctor(taskId);
  printResult(result, json, "external write doctor");
}

console.error("usage: node scripts/external-write.mjs record|proof|cancel|list|doctor --task id [...fields] [--json]");
process.exit(2);

export function validOpenIntent(taskId, now = Date.now()) {
  const { intents, proofs, cancellations } = taskState(taskId);
  const closed = closedIntentIds(proofs, cancellations);
  return intents.find((intent) => validateEntry(intent).length === 0 && !closed.has(intent.id) && Date.parse(intent.expiresAt) >= now) || null;
}

function doctor(taskId) {
  const findings = [];
  const { intents, proofs, cancellations, parseFindings } = taskState(taskId);
  findings.push(...parseFindings);
  const intentIds = new Set(intents.map((intent) => intent.id));
  const closed = closedIntentIds(proofs, cancellations);

  for (const intent of intents) {
    findings.push(...validateEntry(intent));
    if (Date.parse(intent.expiresAt) < Date.now() && !closed.has(intent.id)) findings.push(`intent ${intent.id} is expired and unclosed`);
    if (!closed.has(intent.id)) findings.push(`intent ${intent.id} is missing proof or cancellation`);
  }

  for (const proof of proofs) {
    if (!intentIds.has(proof.intentId)) findings.push(`proof ${proof.id || "<missing>"} references unknown intent ${proof.intentId || "<missing>"}`);
    for (const field of ["id", "taskId", "intentId", "commandOrInspection", "result", "readBack", "createdAt"]) {
      if (!filled(proof[field])) findings.push(`proof ${proof.id || "<missing>"} missing ${field}`);
    }
    if (containsSecret(proof)) findings.push(`proof ${proof.id || "<missing>"} contains secret-like text`);
  }

  for (const cancellation of cancellations) {
    if (!intentIds.has(cancellation.intentId)) findings.push(`cancellation ${cancellation.id || "<missing>"} references unknown intent ${cancellation.intentId || "<missing>"}`);
    for (const field of ["id", "taskId", "intentId", "reason", "createdAt"]) {
      if (!filled(cancellation[field])) findings.push(`cancellation ${cancellation.id || "<missing>"} missing ${field}`);
    }
    if (containsSecret(cancellation)) findings.push(`cancellation ${cancellation.id || "<missing>"} contains secret-like text`);
  }

  return { ok: findings.length === 0, taskId, intents, proofs, cancellations, findings };
}

function validateEntry(intent) {
  const findings = [];
  for (const field of ["id", "taskId", "provider", "action", "target", "reason", "expectedChange", "verification", "rollback", "status", "createdAt", "expiresAt"]) {
    if (!filled(intent[field])) findings.push(`intent ${intent.id || "<missing>"} missing ${field}`);
  }
  if (intent.status && intent.status !== "planned") findings.push(`intent ${intent.id || "<missing>"} has unsupported status ${intent.status}`);
  if (intent.expiresAt && Number.isNaN(Date.parse(intent.expiresAt))) findings.push(`intent ${intent.id || "<missing>"} has invalid expiresAt`);
  if (containsSecret(intent)) findings.push(`intent ${intent.id || "<missing>"} contains secret-like text`);
  return findings;
}

function taskState(taskId) {
  const parseFindings = [];
  return {
    intents: readJsonl(intentPath(taskId), parseFindings),
    proofs: readJsonl(proofPath(taskId), parseFindings),
    cancellations: readJsonl(cancelPath(taskId), parseFindings),
    parseFindings,
  };
}

function readJsonl(path, findings) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index: index + 1 }))
    .filter(({ line }) => Boolean(line))
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch {
        findings.push(`${path} line ${index} is not valid JSON`);
        return null;
      }
    })
    .filter(Boolean);
}

function closedIntentIds(proofs, cancellations) {
  return new Set([
    ...proofs.map((entry) => entry.intentId).filter(Boolean),
    ...cancellations.map((entry) => entry.intentId).filter(Boolean),
  ]);
}

function intentById(taskId, intentId) {
  return taskState(taskId).intents.find((intent) => intent.id === intentId);
}

function intentPath(taskId) {
  const path = pathFromRoot("state", "tasks", taskId, "external-write-intents.jsonl");
  ensureDir(dirname(path));
  return path;
}

function proofPath(taskId) {
  const path = pathFromRoot("state", "tasks", taskId, "external-write-proofs.jsonl");
  ensureDir(dirname(path));
  return path;
}

function cancelPath(taskId) {
  const path = pathFromRoot("state", "tasks", taskId, "external-write-cancellations.jsonl");
  ensureDir(dirname(path));
  return path;
}

function requiredFlag(name) {
  const value = parseFlag(args, name, "");
  if (!filled(value)) printResult({ ok: false, findings: [`missing ${name}`] }, json, "external write");
  return value;
}

function expiresAt(ttlMinutes) {
  const ttl = Math.max(1, Math.min(24 * 60, Number(ttlMinutes) || 60));
  return new Date(Date.now() + ttl * 60_000).toISOString();
}

function containsSecret(value) {
  return looksLikeSecretText(JSON.stringify(value));
}

function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}
