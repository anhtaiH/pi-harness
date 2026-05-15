import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, readJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "doctor";
const json = hasFlag(args, "--json");
const taskId = parseFlag(args, "--task", args.find((arg) => !arg.startsWith("--") && arg !== command));
const config = readJson(pathFromRoot("harness.config.json"), {});
const policy = {
  green: "none",
  yellow: "recommended",
  red: "required",
  ...(config.reviewPolicy?.requiredByRisk || config.reviewPolicy || {}),
};

if (["doctor", "check"].includes(command)) {
  if (!taskId) output({ ok: false, findings: ["missing --task <taskId>"], warnings: [] }, "review policy", 2);
  const task = readTask(taskId);
  if (!task) output({ ok: false, taskId, findings: [`unknown task: ${taskId}`], warnings: [] }, "review policy", 2);
  const state = reviewState(taskId);
  const requirement = normalize(policy[task.risk] || "none");
  const hasLane = state.lanes > 0;
  const hasFinding = state.findings > 0;
  const hasCompletedRun = state.latestRunStatuses.some((status) => ["done", "dry-run"].includes(status));
  const findings = [];
  const warnings = [];
  if (requirement === "required" && (!hasLane || (!hasFinding && !hasCompletedRun))) {
    findings.push(`risk ${task.risk} requires independent review before finish; record a review lane and at least one result/finding`);
  } else if (requirement === "recommended" && (!hasLane || (!hasFinding && !hasCompletedRun))) {
    warnings.push(`risk ${task.risk} should get fresh-context review before finish; current policy recommends but does not block`);
  }
  const result = {
    ok: findings.length === 0,
    command,
    taskId,
    risk: task.risk,
    requirement,
    state,
    warnings,
    findings,
    recommendation: reviewRecommendation(taskId, requirement),
  };
  output(result, "review policy");
}

if (command === "plan") {
  if (!taskId) output({ ok: false, findings: ["missing --task <taskId>"], warnings: [] }, "review policy plan", 2);
  const task = readTask(taskId);
  if (!task) output({ ok: false, taskId, findings: [`unknown task: ${taskId}`], warnings: [] }, "review policy plan", 2);
  const requirement = normalize(policy[task.risk] || "none");
  const state = reviewState(taskId);
  if (requirement === "none") {
    output({ ok: true, command, taskId, risk: task.risk, requirement, planned: false, state, warnings: [], findings: [], recommendation: reviewRecommendation(taskId, requirement) }, "review policy plan");
  }
  if (state.lanes > 0) {
    output({ ok: true, command, taskId, risk: task.risk, requirement, planned: false, state, warnings: [], findings: [], recommendation: "Review lane already exists; record findings or run it when ready." }, "review policy plan");
  }
  const laneArgs = [
    "scripts/review-lane.mjs",
    "plan",
    "--task", taskId,
    "--lane", parseFlag(args, "--lane", "fresh-context"),
    "--reviewer", parseFlag(args, "--reviewer", "harness-reviewer"),
    "--scope", parseFlag(args, "--scope", "diff, evidence, project checks, and safety boundaries"),
    "--prompt", parseFlag(args, "--prompt", "Review this task with fresh context. Check correctness, missing deterministic proof, safety regressions, and whether evidence overclaims. Record at least one finding; use severity info and title 'No blockers' when clean."),
    "--json",
  ];
  if (!hasFlag(args, "--apply")) {
    output({ ok: true, command, taskId, risk: task.risk, requirement, planned: true, applied: false, reviewLaneCommand: `node ${laneArgs.join(" ")}`, warnings: [], findings: [], recommendation: "Rerun with --apply to create the lane." }, "review policy plan");
  }
  const result = spawnSync(process.execPath, laneArgs, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 1024 * 1024 });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout || "{}"); } catch { parsed = null; }
  const ok = result.status === 0 && parsed?.ok !== false;
  output({ ok, command, taskId, risk: task.risk, requirement, planned: true, applied: true, lane: parsed?.lane || null, warnings: [], findings: ok ? [] : parsed?.findings || [result.stderr || result.stdout || `exit ${result.status}`], recommendation: ok ? "Review lane planned. Run or record review findings before finishing risky work." : "Fix review-lane planning failure." }, "review policy plan");
}

if (command === "explain") {
  output({ ok: true, policy, findings: [], warnings: [], recommendation: "green=none, yellow=recommended, red=required by default. Override harness.config.json#reviewPolicy.requiredByRisk." }, "review policy");
}

console.error("usage: node scripts/review-policy.mjs doctor|check|plan|explain --task <taskId> [--apply] [--json]");
process.exit(2);

function readTask(id) {
  return readJson(pathFromRoot("state", "tasks", id, "task.json"), null);
}

function reviewState(id) {
  const dir = pathFromRoot("state", "reviews", id);
  const lanes = readJsonl(join(dir, "lanes.jsonl"));
  const runs = latestById(readJsonl(join(dir, "runs.jsonl")));
  const findings = readJsonl(join(dir, "findings.jsonl"));
  return { lanes: lanes.length, runs: runs.length, findings: findings.length, laneIds: lanes.map((lane) => lane.id), latestRunStatuses: runs.map((run) => run.status) };
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function latestById(entries) {
  const byId = new Map();
  for (const entry of entries) byId.set(entry.id, entry);
  return [...byId.values()];
}

function normalize(value) {
  if (["required", "recommended", "none"].includes(value)) return value;
  if (value === true) return "required";
  if (value === false) return "none";
  return "none";
}

function reviewRecommendation(id, requirement) {
  if (requirement === "none") return "No independent review required by risk policy. You may still run a review lane for confidence.";
  return [
    "Plan a fresh-context review lane:",
    `node scripts/review-lane.mjs plan --task ${id} --lane safety --reviewer harness-reviewer --scope \"diff, evidence, and checks\" --prompt \"Review this task for correctness, missing checks, and safety gaps.\"`,
    "Record at least one finding; use severity info with title `No blockers` when the review passes cleanly.",
  ].join("\n");
}

function output(result, label, code = undefined) {
  if (json) printResult(result, true, label);
  if (result.ok) console.log(`ok   ${label}`);
  else console.log(`fail ${label}: ${(result.findings || []).join("; ")}`);
  if (result.risk) console.log(`Risk: ${result.risk}; requirement: ${result.requirement}`);
  if (result.state) console.log(`Review state: lanes=${result.state.lanes}, runs=${result.state.runs}, findings=${result.state.findings}`);
  if (result.warnings?.length) {
    console.log("Warnings:");
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }
  if (result.recommendation) console.log(result.recommendation);
  process.exit(code ?? (result.ok ? 0 : 1));
}
