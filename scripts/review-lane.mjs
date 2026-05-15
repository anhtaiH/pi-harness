import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename, join, relative } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, appendJsonl, ensureDir, nowIso, looksLikeSecretText, readJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "list";
const json = hasFlag(args, "--json");
const allowedSeverities = new Set(["info", "low", "medium", "high", "critical"]);
const allowedLaneStatuses = new Set(["planned", "running", "done", "cancelled"]);
const allowedRunStatuses = new Set(["dry-run", "running", "done", "failed", "cancelled"]);

if (command === "plan") {
  const lane = buildLane({ status: "planned" });
  const findings = validateLane(lane);
  if (findings.length) printResult({ ok: false, lane, findings }, json, "review lane plan");
  appendJsonl(lanesPath(lane.taskId), lane);
  output({ ok: true, lane, findings: [] }, "review lane planned");
}

if (command === "run") {
  const live = hasFlag(args, "--live");
  const dryRun = hasFlag(args, "--dry-run") || !live;
  const mainAgent = hasFlag(args, "--main-agent");
  const lane = buildLane({ status: live ? "running" : "planned" });
  const agent = parseFlag(args, "--agent", "harness-reviewer");
  const timeoutMs = Number(parseFlag(args, "--timeout-ms", "180000")) || 180000;
  const findings = validateLane(lane);
  if (live && !mainAgent && !taskAllowsTool(lane.taskId, "subagent")) {
    findings.push("live subagent review requires task policy profile `subagent-review` or --main-agent");
  }
  if (findings.length) printResult({ ok: false, lane, findings }, json, "review lane run");

  ensureDir(reviewRunsDir(lane.taskId));
  appendJsonl(lanesPath(lane.taskId), lane);
  const prompt = renderRunPrompt({ lane, agent, mainAgent });
  const promptFile = join(reviewRunsDir(lane.taskId), `${lane.id}.prompt.md`);
  writeFileSync(promptFile, prompt, "utf8");
  const run = {
    id: `run-${nowIso().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    taskId: lane.taskId,
    laneId: lane.id,
    mode: mainAgent ? "main-agent" : "subagent",
    agent,
    status: dryRun ? "dry-run" : "running",
    promptFile,
    outputFile: "",
    createdAt: nowIso(),
    startedAt: live ? nowIso() : "",
    completedAt: "",
  };
  appendJsonl(runsPath(lane.taskId), run);

  if (dryRun) {
    output({ ok: true, lane, run, promptFile, dryRun: true, findings: [] }, "review lane dry-run");
  }

  try {
    const outputText = execFileSync(pathFromRoot("bin", "pi-harness"), ["-p", prompt], {
      cwd: pathFromRoot(),
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const outputFile = join(reviewRunsDir(lane.taskId), `${lane.id}.output.txt`);
    writeFileSync(outputFile, outputText, "utf8");
    const doneRun = { ...run, status: "done", outputFile, completedAt: nowIso() };
    appendJsonl(runsPath(lane.taskId), doneRun);
    output({ ok: true, lane: { ...lane, status: "done" }, run: doneRun, promptFile, outputFile, dryRun: false, findings: [] }, "review lane run");
  } catch (error) {
    const outputFile = join(reviewRunsDir(lane.taskId), `${lane.id}.error.txt`);
    const message = String(error.stdout || error.stderr || error.message || error);
    writeFileSync(outputFile, message.slice(0, 1024 * 1024), "utf8");
    const failedRun = { ...run, status: "failed", outputFile, completedAt: nowIso(), error: String(error.message || error).slice(0, 500) };
    appendJsonl(runsPath(lane.taskId), failedRun);
    printResult({ ok: false, lane, run: failedRun, promptFile, outputFile, findings: [`review lane live run failed: ${failedRun.error}`] }, json, "review lane run");
  }
}

if (command === "finding") {
  const taskId = requiredFlag("--task");
  const finding = {
    id: `find-${nowIso().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    taskId,
    laneId: requiredFlag("--lane-id"),
    severity: parseFlag(args, "--severity", "medium"),
    title: requiredFlag("--title"),
    detail: requiredFlag("--detail"),
    recommendation: requiredFlag("--recommendation"),
    file: parseFlag(args, "--file", ""),
    line: parseFlag(args, "--line", ""),
    source: parseFlag(args, "--source", "manual"),
    createdAt: nowIso(),
  };
  const state = taskState(taskId);
  const laneIds = new Set(state.lanes.map((lane) => lane.id));
  const findings = validateFinding(finding, laneIds);
  if (findings.length) printResult({ ok: false, finding, findings }, json, "review finding");
  appendJsonl(findingsPath(taskId), finding);
  output({ ok: true, finding, findings: [] }, "review finding recorded");
}

if (command === "synthesize") {
  const taskId = requiredFlag("--task");
  const state = taskState(taskId);
  const doctor = doctorTask(taskId, state);
  if (!doctor.ok) printResult(doctor, json, "review synthesis");
  const synthesis = renderSynthesis(taskId, state);
  ensureDir(reviewDir(taskId));
  const path = join(reviewDir(taskId), "synthesis.md");
  writeFileSync(path, synthesis, "utf8");
  output({ ok: true, taskId, synthesisFile: path, lanes: state.lanes.length, runs: state.runs.length, findings: state.findings.length, doctorFindings: [] }, "review synthesis written");
}

if (command === "list") {
  const taskId = requiredFlag("--task");
  const state = taskState(taskId);
  output({ ok: true, taskId, ...state, findings: [] }, "review lanes");
}

if (command === "doctor") {
  const taskId = requiredFlag("--task");
  output(doctorTask(taskId, taskState(taskId)), "review doctor");
}

console.error("usage: node scripts/review-lane.mjs plan|run|finding|synthesize|list|doctor --task id [...] [--json]");
process.exit(2);

function buildLane({ status }) {
  const taskId = requiredFlag("--task");
  return {
    id: `rev-${nowIso().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    taskId,
    lane: requiredFlag("--lane"),
    reviewer: parseFlag(args, "--reviewer", "unassigned"),
    scope: requiredFlag("--scope"),
    prompt: requiredFlag("--prompt"),
    status,
    createdAt: nowIso(),
  };
}

function doctorTask(taskId, state = taskState(taskId)) {
  const findings = [...state.parseFindings];
  const warnings = [];
  const laneIds = new Set(state.lanes.map((lane) => lane.id));
  for (const lane of state.lanes) findings.push(...validateLane(lane));
  for (const finding of state.findings) findings.push(...validateFinding(finding, laneIds));
  for (const run of state.runs) findings.push(...validateRun(run, laneIds));
  for (const lane of state.lanes) {
    if (!state.findings.some((finding) => finding.laneId === lane.id)) warnings.push(`lane ${lane.id} has no recorded findings yet`);
  }
  return { ok: findings.length === 0, taskId, laneCount: state.lanes.length, runCount: state.runs.length, findingCount: state.findings.length, warnings, findings };
}

function validateLane(lane) {
  const findings = [];
  for (const field of ["id", "taskId", "lane", "reviewer", "scope", "prompt", "status", "createdAt"]) {
    if (!filled(lane[field])) findings.push(`review lane ${lane.id || "<missing>"} missing ${field}`);
  }
  if (lane.status && !allowedLaneStatuses.has(lane.status)) findings.push(`review lane ${lane.id || "<missing>"} has invalid status ${lane.status}`);
  if (looksLikeSecretText(JSON.stringify(lane))) findings.push(`review lane ${lane.id || "<missing>"} contains secret-like text`);
  return findings;
}

function validateFinding(finding, laneIds) {
  const findings = [];
  for (const field of ["id", "taskId", "laneId", "severity", "title", "detail", "recommendation", "source", "createdAt"]) {
    if (!filled(finding[field])) findings.push(`review finding ${finding.id || "<missing>"} missing ${field}`);
  }
  if (finding.severity && !allowedSeverities.has(finding.severity)) findings.push(`review finding ${finding.id || "<missing>"} has invalid severity ${finding.severity}`);
  if (finding.laneId && !laneIds.has(finding.laneId)) findings.push(`review finding ${finding.id || "<missing>"} references unknown lane ${finding.laneId}`);
  if (looksLikeSecretText(JSON.stringify(finding))) findings.push(`review finding ${finding.id || "<missing>"} contains secret-like text`);
  return findings;
}

function validateRun(run, laneIds) {
  const findings = [];
  for (const field of ["id", "taskId", "laneId", "mode", "agent", "status", "promptFile", "createdAt"]) {
    if (!filled(run[field])) findings.push(`review run ${run.id || "<missing>"} missing ${field}`);
  }
  if (run.status && !allowedRunStatuses.has(run.status)) findings.push(`review run ${run.id || "<missing>"} has invalid status ${run.status}`);
  if (run.laneId && !laneIds.has(run.laneId)) findings.push(`review run ${run.id || "<missing>"} references unknown lane ${run.laneId}`);
  if (run.promptFile && !existsSync(run.promptFile)) findings.push(`review run ${run.id || "<missing>"} prompt file missing`);
  if (looksLikeSecretText(JSON.stringify(run))) findings.push(`review run ${run.id || "<missing>"} contains secret-like text`);
  return findings;
}

function taskState(taskId) {
  const parseFindings = [];
  return {
    lanes: readJsonl(lanesPath(taskId), parseFindings),
    runs: readJsonl(runsPath(taskId), parseFindings),
    findings: readJsonl(findingsPath(taskId), parseFindings),
    parseFindings,
  };
}

function readJsonl(path, parseFindings) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index: index + 1 }))
    .filter(({ line }) => Boolean(line))
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch {
        parseFindings.push(`${path} line ${index} is not valid JSON`);
        return null;
      }
    })
    .filter(Boolean);
}

function renderRunPrompt({ lane, agent, mainAgent }) {
  const instructions = [
    `You are running a bounded Pi harness review lane for task ${lane.taskId}.`,
    `Lane: ${lane.lane}`,
    `Scope: ${lane.scope}`,
    "Safety boundaries:",
    "- Review only; do not edit files, do not write external systems, and do not read secret-bearing paths.",
    "- If you need to mention a finding, use concise structured bullets: severity, title, detail, recommendation, file/line if relevant.",
    "- Keep output local to this run; the supervisor will record findings with harness_review_record_finding.",
    "",
  ];
  if (!mainAgent) {
    instructions.push(
      `Use the subagent tool once with agent \`${agent}\`, context \`fresh\`, cwd \`${pathFromRoot()}\`, and this review task.`,
      "If the subagent tool is unavailable or policy blocks it, report that clearly and stop.",
      "",
    );
  }
  instructions.push("Review task:", lane.prompt, "");
  return instructions.join("\n");
}

function renderSynthesis(taskId, state) {
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  const counts = Object.fromEntries(severityOrder.map((severity) => [severity, state.findings.filter((finding) => finding.severity === severity).length]));
  const latestRuns = latestById(state.runs);
  const lines = [
    `# Review Synthesis: ${taskId}`,
    "",
    `- Generated at: ${nowIso()}`,
    `- Lanes: ${state.lanes.length}`,
    `- Runs: ${latestRuns.length}`,
    `- Findings: ${state.findings.length}`,
    `- Severity counts: ${severityOrder.map((severity) => `${severity}=${counts[severity]}`).join(", ")}`,
    "",
    "## Lanes",
    "",
    ...state.lanes.map((lane) => `- ${lane.id}: ${lane.lane} (${lane.reviewer}) — ${lane.scope}`),
    "",
    "## Runs",
    "",
  ];
  if (latestRuns.length === 0) {
    lines.push("- None recorded.");
  } else {
    for (const run of latestRuns) {
      const output = run.outputFile ? ` output=${relative(pathFromRoot(), run.outputFile)}` : "";
      lines.push(`- ${run.id}: ${run.status} lane=${run.laneId} agent=${run.agent}${output}`);
    }
  }
  lines.push("", "## Findings", "");
  if (state.findings.length === 0) {
    lines.push("- None recorded.");
  } else {
    for (const finding of [...state.findings].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))) {
      const location = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : "";
      lines.push(`- [${finding.severity}] ${finding.title}${location}`);
      lines.push(`  - Detail: ${finding.detail}`);
      lines.push(`  - Recommendation: ${finding.recommendation}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function latestById(runs) {
  const byId = new Map();
  for (const run of runs) byId.set(run.id, run);
  return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.completedAt).localeCompare(String(a.completedAt)));
}

function taskAllowsTool(taskId, tool) {
  const taskPolicy = readJson(pathFromRoot("state", "tasks", taskId, "tool-policy.json"), {});
  const allowlist = taskPolicy.allowlist || [];
  return allowlist.some((pattern) => pattern === tool || (pattern.endsWith("*") && tool.startsWith(pattern.slice(0, -1))));
}

function reviewDir(taskId) {
  return pathFromRoot("state", "reviews", taskId);
}

function reviewRunsDir(taskId) {
  return join(reviewDir(taskId), "runs");
}

function lanesPath(taskId) {
  const path = join(reviewDir(taskId), "lanes.jsonl");
  ensureDir(reviewDir(taskId));
  return path;
}

function runsPath(taskId) {
  const path = join(reviewDir(taskId), "runs.jsonl");
  ensureDir(reviewDir(taskId));
  return path;
}

function findingsPath(taskId) {
  const path = join(reviewDir(taskId), "findings.jsonl");
  ensureDir(reviewDir(taskId));
  return path;
}

function requiredFlag(name) {
  const value = parseFlag(args, name, "");
  if (!filled(value)) printResult({ ok: false, findings: [`missing ${name}`] }, json, "review lane");
  return value;
}

function output(result, label) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (!result.ok) printResult(result, json, label);
  if (result.run) console.log(`${label}: ${result.run.id} (${basename(result.promptFile || "")})`);
  else if (result.lane) console.log(`${label}: ${result.lane.id}`);
  else if (result.finding) console.log(`${label}: ${result.finding.id}`);
  else if (result.synthesisFile) console.log(`${label}: ${result.synthesisFile}`);
  else console.log(`ok   ${label}`);
  process.exit(0);
}

function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}
