import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, readJson, redact, root, looksLikeSecretText } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "doctor";
const json = hasFlag(args, "--json");
const config = readJson(pathFromRoot("harness.config.json"), {});
const stateToolMetadata = readJson(pathFromRoot("state", "policy", "tool-metadata.json"), {});

const hardDenyRegexes = [
  /(^|[/"'\s])\.env[^/"'\s]*(?=$|[/"'\s])/i,
  /(^|[/"'\s])\.npmrc(?=$|[/"'\s])/i,
  /(^|[/"'\s])\.netrc(?=$|[/"'\s])/i,
  /(^|[/"'\s])\.ssh(?:\/|$)/i,
  /(^|[/"\'\s])(?:auth|tokens?|credentials?)(?:\.(?:json|ya?ml|txt)|\/)(?=$|[/"\'\s])/i,
  /(^|[/"'\s])\.pi-agent(?:\/|$)/i,
  /(^|[/"'\s])\.gemini(?:\/|$)/i,
  /(^|[/"'\s])\.codex(?:\/|$)/i,
  /(^|[/"'\s])\.claude(?:\/|$)/i,
];

const secretCommandRegexes = [
  /\bsecurity\s+find-/i,
  /\bop\s+read\b/i,
  /(?:^|[;&|({\s:"'])(?:env|printenv)(?:$|[\s;&|)])/i,
  /\bcat\s+\/proc\/self\/environ\b/i,
  /\baws\s+configure\s+get\b/i,
  /\bgh\s+auth\s+token\b/i,
  /\bnpm\s+token\b/i,
  /\$(?:\{)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH|CRED|CREDENTIAL|PASS|PAT)[A-Z0-9_]*(?:\})?/i,
];
const destructiveRegex = /\b(?:rm\s+(?:-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r)|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f|drop\s+database|truncate\s+table|delete\s+from)\b/i;
const externalWriteRegex = /\b(?:gh\s+(?:pr|issue)\s+(?:create|edit|close|reopen|comment|review|merge|ready)|gh\s+release|gh\s+api\b.*\b(?:POST|PATCH|PUT|DELETE)\b|curl\b.*\b(?:-X|--request)\s*(?:POST|PATCH|PUT|DELETE)\b|confluence-edit\s+(?:replace|append)|jira\s+(?:create|edit|transition|comment)|deploy\b|rollback\b|release\b)\b/i;

if (command === "doctor") {
  const policy = { ...(config.toolPolicy || {}), toolMetadata: { ...((config.toolPolicy || {}).toolMetadata || {}), ...stateToolMetadata } };
  const findings = [];
  if (!Array.isArray(policy.allowlist) || policy.allowlist.length === 0) findings.push("toolPolicy.allowlist is empty");
  if (!Array.isArray(policy.hardDenyPathPatterns) || policy.hardDenyPathPatterns.length === 0) findings.push("toolPolicy.hardDenyPathPatterns is empty");
  const metadata = metadataCatalog(policy.toolMetadata || {});
  findings.push(...metadata.findings.map((finding) => `toolMetadata: ${finding}`));
  const recommendations = policyRecommendations(policy);
  printResult({
    ok: findings.length === 0,
    mode: policy.defaultMode || "strict",
    runtimeEnforcement: policy.runtimeEnforcement !== false,
    allowlist: policy.allowlist || [],
    hardDenyPathPatterns: policy.hardDenyPathPatterns || [],
    metadataEntries: metadata.entries.length,
    metadataSummary: metadata.summary,
    recommendations,
    findings,
  }, json, "tool policy doctor");
}

if (command === "metadata") {
  const policy = { ...(config.toolPolicy || {}), toolMetadata: { ...((config.toolPolicy || {}).toolMetadata || {}), ...stateToolMetadata } };
  const metadata = metadataCatalog(policy.toolMetadata || {});
  printResult({ ok: metadata.findings.length === 0, ...metadata }, json, "tool policy metadata");
}

if (command === "check") {
  const tool = parseFlag(args, "--tool", "");
  const taskId = parseFlag(args, "--task", "");
  const inputJson = parseFlag(args, "--input-json", "{}");
  const yolo = hasFlag(args, "--yolo") || /^(1|true|yes|on)$/i.test(process.env.PI_HARNESS_YOLO || "");
  let input;
  try {
    input = JSON.parse(inputJson);
  } catch {
    input = { raw: inputJson };
  }
  const result = evaluateToolCall({ tool, input, taskId, yolo });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.decision} ${tool}: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

console.error("usage: node scripts/tool-policy.mjs doctor|metadata|check [--tool name --input-json json --task taskId --yolo] [--json]");
process.exit(2);

function evaluateToolCall({ tool, input, taskId, yolo }) {
  const findings = [];
  if (!tool) findings.push("missing --tool");
  const policy = effectivePolicy(taskId);
  const rawInputText = JSON.stringify(input || {});
  const inputText = redact(rawInputText);
  const pathText = typeof input?.path === "string" ? input.path : rawInputText;
  const secretCheckText = tool === "read" ? pathText : rawInputText;

  if (!matchesAny(tool, policy.allowlist || [])) {
    return decision(false, "block", "tool is not in the allowlist", findings, { tool, policy });
  }

  if (looksLikeSecretText(rawInputText) || hardDenyRegexes.some((pattern) => pattern.test(secretCheckText)) || secretCommandRegexes.some((pattern) => pattern.test(rawInputText))) {
    return decision(false, "block", "secret-bearing path or credential command detected", findings, { tool });
  }

  if (tool === "bash") {
    const command = typeof input?.command === "string" ? input.command : inputText;
    if (destructiveRegex.test(command)) {
      return yolo
        ? decision(true, "audit", "destructive shell command allowed by yolo policy", findings, { tool, risk: "destructive" })
        : decision(false, "block", "destructive shell command requires yolo policy", findings, { tool, risk: "destructive" });
    }
    if (externalWriteRegex.test(command)) {
      return externalWriteDecision({ taskId, findings, tool, reason: "external write-like command requires a valid task-scoped intent" });
    }
  }

  const metadata = toolMetadata(tool, input, policy);
  if (metadata.externalWrite || metadata.mutatesExternal) {
    return externalWriteDecision({ taskId, findings, tool, reason: metadata.reason || "external write-like tool requires a valid task-scoped intent", metadata });
  }

  if ((policy.riskyTools || []).includes(tool)) {
    return yolo
      ? decision(true, "audit", "risky tool allowed by yolo policy", findings, { tool, risk: "risky-tool" })
      : decision(true, "allow", "risky tool allowed in strict mode because no risky input pattern matched", findings, { tool, risk: "risky-tool" });
  }

  return decision(true, "allow", "allowed", findings, { tool });
}

function effectivePolicy(taskId) {
  const base = { ...(config.toolPolicy || {}), toolMetadata: { ...((config.toolPolicy || {}).toolMetadata || {}), ...stateToolMetadata } };
  if (!taskId) return base;
  const taskPolicy = readJson(pathFromRoot("state", "tasks", taskId, "tool-policy.json"), {});
  if (isExpiredPolicy(taskPolicy)) {
    return { ...base, expiredTaskPolicy: { taskId, expiresAt: taskPolicy.expiresAt } };
  }
  return {
    ...base,
    ...taskPolicy,
    allowlist: unique([...(base.allowlist || []), ...(taskPolicy.allowlist || [])]),
    riskyTools: unique([...(base.riskyTools || []), ...(taskPolicy.riskyTools || [])]),
    hardDenyPathPatterns: taskPolicy.hardDenyPathPatterns || base.hardDenyPathPatterns || [],
    toolMetadata: { ...(base.toolMetadata || {}), ...(taskPolicy.toolMetadata || {}) },
  };
}

function metadataCatalog(metadata) {
  const entries = Object.entries(metadata || {}).map(([pattern, value]) => ({
    pattern,
    readOnly: Boolean(value?.readOnly),
    externalWrite: Boolean(value?.externalWrite || value?.mutatesExternal),
    mutatesExternal: Boolean(value?.mutatesExternal),
    description: value?.description || "",
    owner: value?.owner || "",
    source: value?.source || "config",
  }));
  const findings = [];
  for (const entry of entries) {
    if (!entry.readOnly && !entry.externalWrite) findings.push(`${entry.pattern} is neither readOnly nor externalWrite`);
    if (entry.readOnly && entry.externalWrite) findings.push(`${entry.pattern} cannot be both readOnly and externalWrite`);
    if (!entry.description) findings.push(`${entry.pattern} missing description`);
  }
  const summary = {
    total: entries.length,
    readOnly: entries.filter((entry) => entry.readOnly).length,
    externalWrite: entries.filter((entry) => entry.externalWrite).length,
    patterns: entries.filter((entry) => entry.pattern.endsWith("*")).length,
  };
  return { entries, summary, findings };
}

function policyRecommendations(policy) {
  const settings = readJson(pathFromRoot(".pi", "settings.json"), {});
  const packages = settings.packages || [];
  const allowlist = policy.allowlist || [];
  const recommendations = [];
  if (packages.some((spec) => String(spec).includes("pi-mcp-adapter")) && !allowlist.includes("mcp") && !allowlist.includes("server_*")) {
    recommendations.push("pi-mcp-adapter is installed; keep MCP tools blocked by default, or add task-scoped allowlist entries with `npm run policy:profile -- apply --profile mcp-discovery` or selected direct tools via `mcp-direct-selected` after reviewing connector scope.");
  }
  if (packages.some((spec) => String(spec).includes("pi-subagents")) && !allowlist.includes("subagent")) {
    recommendations.push("pi-subagents is installed; allow the `subagent` tool only through the task-scoped `subagent-review` policy profile after review-lane provenance and one-writer expectations are set.");
  }
  if (policy.runtimeEnforcement === false) {
    recommendations.push("runtimeEnforcement is disabled; re-enable it before relying on live Pi tool-call policy.");
  }
  return recommendations;
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => {
    if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
    return value === pattern;
  });
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function isExpiredPolicy(policy) {
  return Boolean(policy?.expiresAt && Date.parse(policy.expiresAt) < Date.now());
}

function toolMetadata(tool, input, policy) {
  const configured = metadataForTool(tool, policy.toolMetadata || {});
  if (configured) return { ...configured, source: "configured-metadata" };
  if (tool.startsWith("harness_")) {
    return { externalWrite: false, readOnly: false, localOnly: true, source: "harness-local" };
  }
  const actionToolPattern = new RegExp(`^(?:mcp:)?[^\s]*(?:create|update|delete|remove|merge|close|reopen|comment|post|send|transition|deploy|release|rollback)[^\s]*$`, "i");
  if (actionToolPattern.test(tool)) {
    return { externalWrite: true, reason: "tool name looks like an external write", source: "heuristic" };
  }
  return { externalWrite: false, readOnly: true, source: "default" };
}

function metadataForTool(tool, metadata) {
  if (metadata[tool]) return metadata[tool];
  for (const [pattern, value] of Object.entries(metadata)) {
    if (pattern.endsWith("*") && tool.startsWith(pattern.slice(0, -1))) return value;
  }
  return null;
}

function externalWriteDecision({ taskId, findings, tool, reason, metadata = {} }) {
  const intent = taskId ? externalWriteIntentExists(taskId) : null;
  if (!intent) return decision(false, "block", reason, findings, { tool, risk: "external-write", metadata });
  return decision(true, "audit", "external write-like tool has task intent", findings, { tool, risk: "external-write", intentId: intent.id, metadata });
}

function externalWriteIntentExists(taskId) {
  const intentPath = join(root, "state", "tasks", taskId, "external-write-intents.jsonl");
  if (!existsSync(intentPath)) return null;
  const proofPath = join(root, "state", "tasks", taskId, "external-write-proofs.jsonl");
  const cancelPath = join(root, "state", "tasks", taskId, "external-write-cancellations.jsonl");
  const closed = new Set([
    ...readJsonLines(proofPath).map((entry) => entry?.intentId).filter(Boolean),
    ...readJsonLines(cancelPath).map((entry) => entry?.intentId).filter(Boolean),
  ]);
  const now = Date.now();
  return readJsonLines(intentPath).find((entry) => isValidOpenIntent(entry, closed, now)) || null;
}

function isValidOpenIntent(entry, closed, now) {
  if (!entry || typeof entry !== "object") return false;
  if (closed.has(entry.id)) return false;
  for (const field of ["id", "taskId", "provider", "action", "target", "reason", "expectedChange", "verification", "rollback", "createdAt", "expiresAt"]) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") return false;
  }
  if (entry.status !== "planned") return false;
  const expiresAt = Date.parse(entry.expiresAt);
  return !Number.isNaN(expiresAt) && expiresAt >= now && !looksLikeSecretText(JSON.stringify(entry));
}

function decision(ok, decisionValue, reason, findings, details) {
  return { ok, decision: decisionValue, reason, findings, ...details };
}

function readJsonLines(path) {
  const text = readJsonText(path);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    });
}

function readJsonText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
