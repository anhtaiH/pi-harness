import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { hasFlag, nowIso, parseFlag, pathFromRoot, printResult, readJson, writeJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "list";
const json = hasFlag(args, "--json");
const DEFAULT_TTL_MINUTES = 240;

const profiles = {
  "mcp-discovery": {
    description: "Allow only the lazy `mcp` proxy tool for a reviewed task/connector discovery lane.",
    allowlist: ["mcp"],
    riskyTools: ["mcp"],
    cautions: [
      "Remote connector output may contain sensitive operational context; do not request secrets or broad dumps.",
      "External write-like connector calls still require a task-scoped external-write intent/proof.",
    ],
  },
  "subagent-review": {
    description: "Allow the reviewed `subagent` tool for bounded review-lane execution.",
    allowlist: ["subagent"],
    riskyTools: ["subagent"],
    cautions: [
      "Prefer project-local read-only harness agents such as harness-reviewer and harness-scout.",
      "Keep one-writer discipline before launching reviewers that can use tools.",
      "Record review lanes/findings/provenance for outputs that influence implementation.",
    ],
  },
  "mcp-direct-selected": {
    description: "Allow explicitly named direct MCP tools, for example server_docs_search. Requires --tools.",
    allowlist: [],
    riskyTools: [],
    requiresTools: true,
    cautions: [
      "Use exact direct tool names only; wildcard MCP allowlists are intentionally rejected by this profile.",
      "Review connector scope and write behavior before selecting tools.",
    ],
  },
};

if (command === "list") {
  output({ ok: true, defaultTtlMinutes: DEFAULT_TTL_MINUTES, profiles, findings: [] }, "policy profiles");
}

if (command === "show") {
  const taskId = requiredFlag("--task");
  ensureTask(taskId);
  output({ ok: true, taskId, policy: readJson(policyPath(taskId), null), findings: [] }, "task policy profile");
}

if (command === "apply") {
  const taskId = requiredFlag("--task");
  const profileName = requiredFlag("--profile");
  const profile = profiles[profileName];
  if (!profile) {
    printResult({ ok: false, profiles: Object.keys(profiles), findings: [`unknown profile: ${profileName}`] }, json, "policy profile apply");
  }
  ensureTask(taskId);

  const selectedTools = parseList(parseFlag(args, "--tools", ""));
  if (profile.requiresTools && selectedTools.length === 0) {
    printResult({ ok: false, findings: [`profile ${profileName} requires --tools with explicit tool names`] }, json, "policy profile apply");
  }

  const validationFindings = validateSelectedTools(profileName, selectedTools);
  if (validationFindings.length) printResult({ ok: false, findings: validationFindings }, json, "policy profile apply");

  const base = basePolicy();
  const existing = hasFlag(args, "--replace") ? {} : readJson(policyPath(taskId), {});
  const profileAllowlist = profileName === "mcp-direct-selected" ? selectedTools : [...profile.allowlist, ...selectedTools];
  const profileRiskyTools = profileName === "mcp-direct-selected" ? selectedTools : [...profile.riskyTools, ...selectedTools];
  const expiresAt = resolveExpiresAt(existing);
  const clearOnFinish = resolveClearOnFinish(existing);
  const application = {
    profile: profileName,
    tools: selectedTools,
    appliedAt: nowIso(),
    expiresAt,
    clearOnFinish,
    notes: parseFlag(args, "--notes", ""),
  };
  const taskPolicy = {
    version: 1,
    taskId,
    appliedAt: nowIso(),
    appliedBy: "policy-profile",
    profiles: unique([...(existing.profiles || []), profileName]),
    selectedTools: unique([...(existing.selectedTools || []), ...selectedTools]),
    allowlist: unique([...(base.allowlist || []), ...(existing.allowlist || []), ...profileAllowlist]),
    riskyTools: unique([...(base.riskyTools || []), ...(existing.riskyTools || []), ...profileRiskyTools]),
    hardDenyPathPatterns: existing.hardDenyPathPatterns || base.hardDenyPathPatterns || [],
    externalWritesRequireIntent: existing.externalWritesRequireIntent ?? base.externalWritesRequireIntent ?? true,
    runtimeEnforcement: existing.runtimeEnforcement ?? base.runtimeEnforcement ?? true,
    expiresAt,
    clearOnFinish,
    profileApplications: [...(existing.profileApplications || []), application],
    notes: compact([existing.notes, parseFlag(args, "--notes", "")]).join("\n"),
    cautions: unique([...(existing.cautions || []), ...(profile.cautions || [])]),
  };

  const findings = validateTaskPolicy(taskPolicy, { includeLifecycle: false }).findings;
  if (findings.length) printResult({ ok: false, taskId, policy: taskPolicy, findings }, json, "policy profile apply");
  writeJson(policyPath(taskId), taskPolicy);
  output({ ok: true, taskId, profile: profileName, expiresAt, clearOnFinish, policy: taskPolicy, findings: [] }, "policy profile applied");
}

if (command === "clear") {
  const taskId = requiredFlag("--task");
  ensureTask(taskId);
  rmSync(policyPath(taskId), { force: true });
  output({ ok: true, taskId, findings: [] }, "policy profile cleared");
}

if (command === "clear-expired" || command === "prune") {
  const dryRun = hasFlag(args, "--dry-run");
  const cleared = [];
  const skipped = [];
  for (const taskId of taskIds()) {
    const policy = readJson(policyPath(taskId), null);
    if (!policy) continue;
    const task = readTask(taskId);
    if (isExpired(policy) || (task.status === "done" && policy.clearOnFinish)) {
      cleared.push({ taskId, reason: isExpired(policy) ? "expired" : "done-clear-on-finish", expiresAt: policy.expiresAt || "" });
      if (!dryRun) rmSync(policyPath(taskId), { force: true });
    } else {
      skipped.push({ taskId, reason: "active-or-non-expiring", expiresAt: policy.expiresAt || "" });
    }
  }
  output({ ok: true, dryRun, cleared, skipped, findings: [] }, "policy profile prune");
}

if (command === "doctor") {
  const findings = [];
  const warnings = [];
  const tasks = taskIds();
  const policies = [];
  for (const taskId of tasks) {
    const policy = readJson(policyPath(taskId), null);
    if (!policy) continue;
    const task = readTask(taskId);
    const validation = validateTaskPolicy(policy, { task, includeLifecycle: true });
    policies.push({
      taskId,
      taskStatus: task.status || "open",
      profiles: policy.profiles || [],
      selectedTools: policy.selectedTools || [],
      allowlist: policy.allowlist || [],
      riskyTools: policy.riskyTools || [],
      expiresAt: policy.expiresAt || "",
      clearOnFinish: Boolean(policy.clearOnFinish),
      expired: isExpired(policy),
    });
    findings.push(...validation.findings.map((finding) => `${taskId}: ${finding}`));
    warnings.push(...validation.warnings.map((warning) => `${taskId}: ${warning}`));
  }
  output({ ok: findings.length === 0, taskCount: tasks.length, policyCount: policies.length, policies, warnings, findings }, "policy profile doctor");
}

console.error("usage: node scripts/policy-profile.mjs list|show|apply|clear|clear-expired|prune|doctor [--task id --profile name --tools a,b --ttl-minutes n --expires-at iso --no-expire --clear-on-finish --no-clear-on-finish --replace --notes text --dry-run] [--json]");
process.exit(2);

function basePolicy() {
  return readJson(pathFromRoot("harness.config.json"), {}).toolPolicy || {};
}

function policyPath(taskId) {
  return pathFromRoot("state", "tasks", taskId, "tool-policy.json");
}

function readTask(taskId) {
  return readJson(pathFromRoot("state", "tasks", taskId, "task.json"), {});
}

function ensureTask(taskId) {
  if (!existsSync(pathFromRoot("state", "tasks", taskId, "task.json"))) {
    printResult({ ok: false, findings: [`unknown task: ${taskId}`] }, json, "policy profile");
  }
}

function taskIds() {
  const dir = pathFromRoot("state", "tasks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => existsSync(join(dir, name, "task.json"))).sort();
}

function validateTaskPolicy(policy, options = {}) {
  const findings = [];
  const warnings = [];
  if (policy.version !== 1) findings.push("tool-policy.json must have version 1");
  if (!filled(policy.taskId)) findings.push("tool-policy.json missing taskId");
  if (!Array.isArray(policy.profiles)) findings.push("tool-policy.json profiles must be an array");
  if (!Array.isArray(policy.allowlist) || policy.allowlist.length === 0) findings.push("tool-policy.json allowlist must be a non-empty array");
  if (!Array.isArray(policy.riskyTools)) findings.push("tool-policy.json riskyTools must be an array");
  if (policy.selectedTools !== undefined && !Array.isArray(policy.selectedTools)) findings.push("tool-policy.json selectedTools must be an array when provided");
  if (policy.profileApplications !== undefined && !Array.isArray(policy.profileApplications)) findings.push("tool-policy.json profileApplications must be an array when provided");
  for (const tool of [...(policy.allowlist || []), ...(policy.riskyTools || []), ...(policy.selectedTools || [])]) {
    if (!validToolName(tool)) findings.push(`invalid tool name in task policy: ${tool}`);
  }
  for (const profileName of policy.profiles || []) {
    if (!profiles[profileName]) findings.push(`unknown recorded profile: ${profileName}`);
  }
  if (policy.expiresAt && Number.isNaN(Date.parse(policy.expiresAt))) findings.push("tool-policy.json has invalid expiresAt");
  if (options.includeLifecycle) {
    const task = options.task || readTask(policy.taskId || "");
    if (!policy.expiresAt) warnings.push("task policy has no expiresAt; prefer expiring profiles for MCP/subagent access");
    if (isExpired(policy) && task.status !== "done") findings.push(`task policy expired at ${policy.expiresAt}`);
    if (task.status === "done" && policy.clearOnFinish) warnings.push("done task still has clearOnFinish policy; run policy-profile clear-expired/prune");
  }
  return { findings, warnings };
}

function validateSelectedTools(profileName, selectedTools) {
  const findings = [];
  for (const tool of selectedTools) {
    if (!validToolName(tool)) findings.push(`invalid selected tool name: ${tool}`);
    if (profileName === "mcp-direct-selected" && tool.includes("*")) findings.push(`mcp-direct-selected requires exact tool names, not wildcard: ${tool}`);
    if (["bash", "read", "write", "edit"].includes(tool)) findings.push(`profile-selected tools may not include core tool ${tool}`);
  }
  return findings;
}

function resolveExpiresAt(existing) {
  if (hasFlag(args, "--no-expire")) return "";
  const explicit = parseFlag(args, "--expires-at", "");
  if (explicit) return explicit;
  const ttlRaw = parseFlag(args, "--ttl-minutes", "");
  const ttlMinutes = ttlRaw === "" ? DEFAULT_TTL_MINUTES : Number(ttlRaw);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 0) printResult({ ok: false, findings: ["--ttl-minutes must be a non-negative number"] }, json, "policy profile apply");
  if (ttlMinutes === 0) return existing.expiresAt || "";
  return new Date(Date.now() + ttlMinutes * 60_000).toISOString();
}

function resolveClearOnFinish(existing) {
  if (hasFlag(args, "--clear-on-finish")) return true;
  if (hasFlag(args, "--no-clear-on-finish")) return false;
  if (typeof existing.clearOnFinish === "boolean") return existing.clearOnFinish;
  return true;
}

function isExpired(policy) {
  return Boolean(policy?.expiresAt && Date.parse(policy.expiresAt) < Date.now());
}

function validToolName(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]+\*?$/.test(value) && !value.includes("/") && value.length <= 100;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function compact(values) {
  return values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
}

function requiredFlag(name) {
  const value = parseFlag(args, name, "");
  if (!filled(value)) printResult({ ok: false, findings: [`missing ${name}`] }, json, "policy profile");
  return String(value);
}

function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function output(result, label) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (!result.ok) printResult(result, json, label);
  if (result.profile) console.log(`${label}: ${result.taskId} <- ${result.profile}${result.expiresAt ? ` (expires ${result.expiresAt})` : ""}`);
  else if (result.policy) console.log(`${label}: ${result.taskId}`);
  else if (result.cleared) console.log(`${label}: ${result.cleared.length} cleared${result.dryRun ? " (dry-run)" : ""}`);
  else console.log(`ok   ${label}`);
  process.exit(0);
}
