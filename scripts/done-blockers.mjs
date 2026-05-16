import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, readJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const taskId = parseFlag(args, "--task", args.find((arg) => !arg.startsWith("--"))) || activeTaskId() || newestOpenTaskId();

if (!taskId) finish({ ok: false, taskId: "", lines: ["No active or open task. Create one with `ph brief` or `/harness-brief`."], blockers: [{ id: "no-task", title: "No task", detail: "There is no active or open task.", fix: "ph brief" }], findings: ["no task"] });

const task = readJson(pathFromRoot("state", "tasks", taskId, "task.json"), null);
if (!task) finish({ ok: false, taskId, lines: ["Unknown task: " + taskId], blockers: [{ id: "unknown-task", title: "Unknown task", detail: "No task.json found.", fix: "ph next" }], findings: ["unknown task"] });

const blockers = [];
const recommendations = [];

const taskDoctor = runJson(["scripts/task-doctor.mjs", taskId, "--json"]);
addBlocker(taskDoctor, {
  id: "task-doctor",
  title: "Task packet has problems",
  fix: `Edit ${rel(task.paths.packet)} to fill in Scope, Current State, Desired Behavior, and Verification.`,
});

const projectChecks = runJson(["scripts/project-checks.mjs", "run", "--json"]);
addBlocker(projectChecks, {
  id: "project-checks",
  title: "Project checks failed",
  fix: "Inspect `ph checks run`; fix failing checks or run `ph checks list` to disable a no-longer-relevant check.",
});

const reviewPolicy = runJson(["scripts/review-policy.mjs", "doctor", "--task", taskId, "--json"]);
addBlocker(reviewPolicy, {
  id: "review-policy",
  title: `Review policy ${reviewPolicy.parsed?.requirement || "check"} not satisfied`,
  fix: `Plan a fresh-context review lane: \`ph review-policy plan --task ${taskId} --apply\` and record at least one finding.`,
});

const evidenceDoctor = runJson(["scripts/evidence-doctor.mjs", taskId, "--json"]);
addBlocker(evidenceDoctor, {
  id: "evidence",
  title: "Evidence is missing or incomplete",
  fix: `Edit ${rel(task.paths.evidence)} to fill in Summary, Positive/Negative Proof, Commands Run, Skipped Checks, Diff Risk Notes, and Memory Candidates. Then rerun \`ph done --task ${taskId}\`.`,
});

const proofDoctor = runJson(["scripts/proof-ledger.mjs", "doctor", "--task", taskId, "--json"]);
addBlocker(proofDoctor, {
  id: "proof-ledger",
  title: "Proof ledger has problems",
  fix: "Inspect `state/tasks/<id>/proof-ledger.jsonl`; rerun `ph done --task <id>` to regenerate.",
});

const externalWrite = runJson(["scripts/external-write.mjs", "doctor", "--task", taskId, "--json"]);
addBlocker(externalWrite, {
  id: "external-writes",
  title: "External writes are not closed",
  fix: "Use `ph external-write doctor --task <id>` or close intents with the matching read-back/proof or cancellation.",
});

const ok = blockers.length === 0;
const lines = [];
if (blockers.length) {
  lines.push(`Blocking \`ph done\` for ${taskId}:`);
  lines.push(...blockers.map((blocker, idx) => `  ${idx + 1}. ${blocker.title}\n     fix: ${blocker.fix}`));
} else {
  lines.push(`No hard blockers for ${taskId}. Run \`ph done --task ${taskId}\` to finish.`);
}
if (recommendations.length) {
  lines.push("", "Recommended before done:");
  lines.push(...recommendations.map((item, idx) => `  ${idx + 1}. ${item.title}\n     suggestion: ${item.fix}`));
}

finish({ ok, taskId, risk: task.risk, blockers, recommendations, lines, findings: [] });

function addBlocker(result, info) {
  if (!result.parsed || result.parsed.ok === false) {
    blockers.push({
      ...info,
      detail: detailFor(result),
      raw: result.parsed?.findings || (result.stderr || result.stdout || "").trim().slice(0, 400),
    });
  } else if (Array.isArray(result.parsed.warnings) && result.parsed.warnings.length) {
    recommendations.push({
      ...info,
      severity: "warning",
      detail: result.parsed.warnings.join("; "),
    });
  }
}

function detailFor(result) {
  if (Array.isArray(result.parsed?.findings) && result.parsed.findings.length) return result.parsed.findings.join("; ");
  const text = (result.stderr || result.stdout || "").trim();
  if (text) return text.split(/\r?\n/).slice(0, 4).join(" ").slice(0, 400);
  return `exit ${result.status}`;
}

function runJson(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: pathFromRoot(),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  let parsed = null;
  try { parsed = result.stdout && result.stdout.trim().startsWith("{") ? JSON.parse(result.stdout) : null; } catch { parsed = null; }
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", parsed, command: `node ${commandArgs.join(" ")}` };
}

function activeTaskId() {
  const active = readJson(pathFromRoot("state", "active-task.json"), null);
  return active?.taskId || "";
}

function newestOpenTaskId() {
  const dir = pathFromRoot("state", "tasks");
  if (!existsSync(dir)) return "";
  const tasks = readdirSync(dir)
    .map((name) => readJson(join(dir, name, "task.json"), null))
    .filter(Boolean)
    .filter((task) => !["done", "blocked"].includes(task.status || ""))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return tasks[0]?.id || "";
}

function rel(targetPath) {
  const root = pathFromRoot();
  return String(targetPath).startsWith(root + "/") ? String(targetPath).slice(root.length + 1) : targetPath;
}

function finish(result) {
  if (json) printResult(result, true, "done blockers");
  for (const line of result.lines) console.log(line);
  process.exit(result.ok ? 0 : 1);
}
