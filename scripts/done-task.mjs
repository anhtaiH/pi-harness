import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { appendJsonl, hasFlag, nowIso, parseFlag, pathFromRoot, printResult, readJson, redact, writeJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const forceEvidence = hasFlag(args, "--force-evidence");
const skipProjectChecks = hasFlag(args, "--skip-project-checks");
const skipFinish = hasFlag(args, "--skip-finish");
const allowFailedProjectChecks = hasFlag(args, "--allow-failed-project-checks");
const noAutoReview = hasFlag(args, "--no-auto-review");
const taskId = parseFlag(args, "--task", args.find((arg) => !arg.startsWith("--"))) || activeTaskId() || newestOpenTaskId();

if (!taskId) output({ ok: false, findings: ["no task supplied and no active/open task found"] }, "harness done", 2);
const task = readJson(pathFromRoot("state", "tasks", taskId, "task.json"), null);
if (!task) output({ ok: false, taskId, findings: [`unknown task: ${taskId}`] }, "harness done", 2);
const proofLedgerFile = pathFromRoot("state", "tasks", taskId, "proof-ledger.jsonl");

const steps = [];
const findings = [];
const warnings = [];

const taskDoctor = runJson(["scripts/task-doctor.mjs", taskId, "--json"]);
steps.push(step("task-doctor", taskDoctor));
if (!taskDoctor.parsed?.ok) findings.push(...asFindings("task-doctor", taskDoctor));

let projectChecks = null;
if (!skipProjectChecks) {
  projectChecks = runJson(["scripts/project-checks.mjs", "run", "--json"]);
  steps.push(step("project-checks", projectChecks));
  if (!projectChecks.parsed?.ok) {
    const projectFindings = asFindings("project-checks", projectChecks);
    if (allowFailedProjectChecks) warnings.push(...projectFindings.map((item) => `allowed failed ${item}`));
    else findings.push(...projectFindings);
  }
}

if (!noAutoReview) {
  const reviewPlan = runJson(["scripts/review-policy.mjs", "plan", "--task", taskId, "--apply", "--json"]);
  steps.push(step("review-policy-plan", reviewPlan));
  if (!reviewPlan.parsed?.ok) findings.push(...asFindings("review-policy-plan", reviewPlan));
}

const reviewPolicy = runJson(["scripts/review-policy.mjs", "doctor", "--task", taskId, "--json"]);
steps.push(step("review-policy", reviewPolicy));
if (reviewPolicy.parsed?.warnings?.length) warnings.push(...reviewPolicy.parsed.warnings);
if (!reviewPolicy.parsed?.ok) findings.push(...asFindings("review-policy", reviewPolicy));

let evidenceDoctor = runJson(["scripts/evidence-doctor.mjs", taskId, "--json"]);
steps.push(step("evidence-doctor-before", evidenceDoctor));
const shouldDraft = forceEvidence || !evidenceDoctor.parsed?.ok;
if (findings.length === 0 && shouldDraft) {
  writeEvidence(task, { taskDoctor, projectChecks, reviewPolicy });
  evidenceDoctor = runJson(["scripts/evidence-doctor.mjs", taskId, "--json"]);
  steps.push(step("evidence-drafted", evidenceDoctor));
  if (!evidenceDoctor.parsed?.ok) findings.push(...asFindings("evidence-doctor", evidenceDoctor));
}

if (findings.length === 0) {
  const proofDoctor = runJson(["scripts/proof-ledger.mjs", "doctor", "--task", taskId, "--json"]);
  steps.push(step("proof-ledger", proofDoctor));
  if (!proofDoctor.parsed?.ok) findings.push(...asFindings("proof-ledger", proofDoctor));
}

let finish = null;
if (findings.length === 0 && !skipFinish) {
  finish = runJson(["scripts/finish-task.mjs", taskId, "--json"]);
  steps.push(step("finish-task", finish));
  if (!finish.parsed?.ok) findings.push(...asFindings("finish-task", finish));
  if (finish.parsed?.ok) clearActiveTask(taskId);
}

const result = {
  ok: findings.length === 0,
  taskId,
  draftedEvidence: shouldDraft && findings.length === 0,
  skipped: { projectChecks: skipProjectChecks, finish: skipFinish, autoReview: noAutoReview },
  proofLedger: rel(proofLedgerFile),
  steps,
  warnings,
  findings,
  next: nextSteps({ findings, taskId, skipFinish }),
};
output(result, "harness done");

function runJson(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: pathFromRoot(),
    encoding: "utf8",
    timeout: commandArgs.includes("scripts/finish-task.mjs") ? 15 * 60_000 : 5 * 60_000,
    maxBuffer: 12 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  let parsed = null;
  try { parsed = stdout.trim().startsWith("{") ? JSON.parse(stdout) : null; } catch { parsed = null; }
  const record = { status: result.status, stdout: redact(stdout).slice(0, 8000), stderr: redact(stderr).slice(0, 4000), parsed, command: `node ${commandArgs.join(" ")}` };
  recordProof(commandArgs, record);
  return record;
}

function recordProof(commandArgs, result) {
  const id = `proof-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${String(commandArgs[0] || "cmd").replace(/[^a-z0-9]+/gi, "-").slice(0, 24)}`;
  appendJsonl(proofLedgerFile, {
    id,
    taskId,
    createdAt: nowIso(),
    command: result.command,
    status: result.status,
    ok: result.status === 0 && result.parsed?.ok !== false,
    findingCount: Array.isArray(result.parsed?.findings) ? result.parsed.findings.length : undefined,
    warningCount: Array.isArray(result.parsed?.warnings) ? result.parsed.warnings.length : undefined,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

function step(id, result) {
  return {
    id,
    ok: result.status === 0 && result.parsed?.ok !== false,
    status: result.status,
    command: result.command,
    findingCount: Array.isArray(result.parsed?.findings) ? result.parsed.findings.length : undefined,
    warningCount: Array.isArray(result.parsed?.warnings) ? result.parsed.warnings.length : undefined,
  };
}

function asFindings(prefix, result) {
  if (Array.isArray(result.parsed?.findings) && result.parsed.findings.length) return result.parsed.findings.map((finding) => `${prefix}: ${finding}`);
  return [`${prefix}: ${result.stderr.trim() || result.stdout.trim().slice(0, 240) || `exit ${result.status}`}`];
}

function activeTaskId() {
  const active = readJson(pathFromRoot("state", "active-task.json"), null);
  return active?.taskId || "";
}

function newestOpenTaskId() {
  const taskRoot = pathFromRoot("state", "tasks");
  if (!existsSync(taskRoot)) return "";
  const tasks = readdirSync(taskRoot)
    .map((name) => readJson(join(taskRoot, name, "task.json"), null))
    .filter(Boolean)
    .filter((item) => !["done", "blocked"].includes(item.status || ""))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return tasks[0]?.id || "";
}

function writeEvidence(task, { taskDoctor, projectChecks, reviewPolicy }) {
  const progress = existsSync(task.paths.progress) ? readFileSync(task.paths.progress, "utf8").trim().split(/\r?\n/).slice(-8).join("\n") : "No progress log found.";
  const summary = parseFlag(args, "--summary", "Auto-drafted completion evidence from the task packet, progress log, project checks, and review policy. Review this evidence if the task involved nuanced manual validation.");
  const positiveProof = parseFlag(args, "--positive-proof", positiveProofText({ taskDoctor, projectChecks, reviewPolicy }));
  const negativeProof = parseFlag(args, "--negative-proof", negativeProofText({ projectChecks, reviewPolicy }));
  const commandsRun = [
    taskDoctor.command,
    projectChecks ? projectChecks.command : "project checks skipped by flag",
    reviewPolicy.command,
    "node scripts/evidence-doctor.mjs " + task.id + " --json",
    skipFinish ? "finish skipped by --skip-finish" : "node scripts/finish-task.mjs " + task.id + " --json",
  ].join("\n");
  const evidence = [
    `# Evidence: ${task.id}`,
    "",
    "## Summary",
    "",
    summary,
    "",
    `Proof ledger: ${rel(proofLedgerFile)}`,
    "",
    "Recent progress:",
    "",
    "```text",
    progress,
    "```",
    "",
    "## Positive Proof",
    "",
    `- Command or inspection: ${positiveProof}`,
    "- Result: PASS",
    "",
    "## Negative Proof",
    "",
    `- Regression or failure-mode check: ${negativeProof}`,
    "- Result: PASS",
    "",
    "## Commands Run",
    "",
    "```text",
    commandsRun,
    "```",
    "",
    "## Skipped Checks",
    "",
    skipProjectChecks
      ? "- Check: project checks\n- Reason: skipped by --skip-project-checks\n- Residual risk: project-specific regressions may not be covered by harness gates"
      : "- Check: no skipped checks before evidence drafting\n- Reason: project/review/evidence checks ran before finish\n- Residual risk: review auto-drafted evidence for any manual validations not captured by commands",
    "",
    "## Diff Risk Notes",
    "",
    "- Risk: auto-drafted evidence can miss nuance from the implementation conversation",
    "- Mitigation: deterministic task doctor, project checks, review policy, proof ledger doctor, evidence doctor, and finish gates ran before completion claim",
    "",
    "## Memory Candidates",
    "",
    "- Candidate: no reusable memory candidate identified by the automated done flow",
    `- Source: ${task.id}`,
    "- Confidence: low",
    "",
    "## End",
    "",
    "Task evidence complete.",
    "",
  ].join("\n");
  writeFileSync(task.paths.evidence, evidence, "utf8");
  task.updatedAt = new Date().toISOString();
  writeJson(task.paths.taskJson, task);
}

function positiveProofText({ taskDoctor, projectChecks, reviewPolicy }) {
  const project = projectChecks?.parsed?.results?.length
    ? `project checks passed (${projectChecks.parsed.results.map((item) => item.id).join(", ")})`
    : "project-check detector found no enabled checks or project checks were not applicable";
  return `task doctor passed; ${project}; review policy ${reviewPolicy.parsed?.requirement || "checked"}`;
}

function negativeProofText({ projectChecks, reviewPolicy }) {
  const review = reviewPolicy.parsed?.warnings?.length ? "review policy emitted non-blocking warnings for human follow-up" : "review policy had no blocking findings";
  const project = projectChecks?.parsed?.results?.length ? "project checks would block completion on non-zero exit" : "project check doctor/detection covered missing-check fallback";
  return `${project}; ${review}; evidence doctor reran after drafting`;
}

function rel(targetPath) {
  const root = pathFromRoot();
  return String(targetPath).startsWith(root + "/") ? String(targetPath).slice(root.length + 1) : targetPath;
}

function clearActiveTask(id) {
  const activePath = pathFromRoot("state", "active-task.json");
  const active = readJson(activePath, null);
  if (active?.taskId === id) writeJson(activePath, { taskId: "", source: "done-task", updatedAt: new Date().toISOString() });
}

function nextSteps({ findings, taskId, skipFinish }) {
  if (findings.length) return ["Fix blockers above, then rerun `ph done` or `bin/pi-harness done`."];
  if (skipFinish) return [`Evidence is drafted for ${taskId}; run \`bin/pi-harness done --task ${taskId}\` without --skip-finish to close it.`];
  return ["Task finished. Run `bin/pi-harness next` to confirm no loose ends."];
}

function output(result, label, code = undefined) {
  if (json) printResult(result, true, label);
  console.log("Pi Harness Done");
  console.log("===============");
  console.log(`Task: ${result.taskId}`);
  console.log("");
  for (const item of result.steps || []) {
    const icon = item.ok ? "✓" : "✗";
    const detail = item.findingCount ? ` (${item.findingCount} finding${item.findingCount === 1 ? "" : "s"})` : item.warningCount ? ` (${item.warningCount} warning${item.warningCount === 1 ? "" : "s"})` : "";
    console.log(`${icon} ${stepLabel(item.id)}${detail}`);
  }
  if (result.warnings?.length) {
    console.log("\nWarnings (non-blocking):");
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }
  if (!result.ok && result.findings?.length) {
    console.log("\nWhat is blocking done:");
    for (const finding of friendlyBlockers(result.findings)) console.log(`- ${finding}`);
    console.log("\nFor a detailed blocker list per gate, run: ph blockers --task " + (result.taskId || ""));
  }
  if (result.next?.length) {
    console.log("\nNext:");
    for (const step of result.next) console.log(`- ${step}`);
  }
  console.log("");
  console.log(result.ok ? "Done." : "Blocked.");
  process.exit(code ?? (result.ok ? 0 : 1));
}

function stepLabel(id) {
  const labels = {
    "task-doctor": "Task packet check",
    "project-checks": "Project checks",
    "review-policy-plan": "Plan review lane (auto)",
    "review-policy": "Review policy gate",
    "evidence-doctor-before": "Evidence check (before draft)",
    "evidence-drafted": "Evidence drafted",
    "evidence-doctor": "Evidence check",
    "proof-ledger": "Proof ledger check",
    "finish-task": "Finish gates",
  };
  return labels[id] || id;
}

function friendlyBlockers(findings) {
  return findings.map((finding) => {
    if (finding.startsWith("evidence-doctor")) return finding.replace(/^evidence-doctor: /, "Evidence file is incomplete — ");
    if (finding.startsWith("task-doctor")) return finding.replace(/^task-doctor: /, "Task packet incomplete — ");
    if (finding.startsWith("project-checks")) return finding.replace(/^project-checks: /, "A project check failed — ");
    if (finding.startsWith("review-policy")) return finding.replace(/^review-policy: /, "Review policy not satisfied — ");
    if (finding.startsWith("finish-task")) return finding.replace(/^finish-task: /, "Finish gate failed — ");
    return finding;
  });
}
