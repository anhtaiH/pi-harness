import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { appendJsonl, ensureDir, hasFlag, nowIso, parseFlag, pathFromRoot, printResult, readJson, slug, writeJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "list";
const json = hasFlag(args, "--json");
const stateDir = pathFromRoot("state", "long-runs");

if (command === "plan" || command === "start") {
  const goal = parseFlag(args, "--goal", args.slice(1).filter((arg) => !arg.startsWith("--")).join(" ")).trim();
  if (!goal) output({ ok: false, findings: ["missing long-running goal"] }, "long run plan", 2);
  const id = `lr-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${slug(goal).slice(0, 32)}-${randomUUID().slice(0, 8)}`;
  const dir = join(stateDir, id);
  ensureDir(dir);
  const run = {
    schemaVersion: 1,
    id,
    goal,
    status: "planned",
    risk: parseFlag(args, "--risk", "yellow"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    heartbeatEveryMinutes: Number(parseFlag(args, "--heartbeat-minutes", "60")) || 60,
    budget: {
      maxMinutes: Number(parseFlag(args, "--max-minutes", "480")) || 480,
      maxSessions: Number(parseFlag(args, "--max-sessions", "8")) || 8,
      reviewEveryCheckpoints: Number(parseFlag(args, "--review-every", "3")) || 3,
    },
    milestones: parseMilestones(goal),
    checkpoints: [],
    artifacts: {
      dir: rel(dir),
      plan: rel(join(dir, "plan.md")),
      heartbeat: rel(join(dir, "heartbeat.jsonl")),
      resumePrompt: rel(join(dir, "resume-prompt.md")),
      recovery: rel(join(dir, "recovery.md")),
      checkpoints: rel(join(dir, "checkpoints.jsonl")),
    },
  };
  writeJson(join(dir, "run.json"), run);
  writeFileSync(join(dir, "plan.md"), renderPlan(run), "utf8");
  writeFileSync(join(dir, "resume-prompt.md"), renderResumePrompt(run), "utf8");
  writeFileSync(join(dir, "recovery.md"), renderRecovery(run), "utf8");
  appendJsonl(join(dir, "heartbeat.jsonl"), { timestamp: nowIso(), event: "planned", status: run.status, goal, budget: run.budget });
  output({ ok: true, command, run, findings: [], next: [`Inspect ${run.artifacts.plan}.`, `Start/resume with: bin/pi-harness resume-long ${id}`] }, "long run planned");
}

if (command === "checkpoint") {
  const id = requiredId();
  const run = loadRun(id);
  const note = parseFlag(args, "--note", "checkpoint");
  const task = parseFlag(args, "--task", "");
  const snapshot = gitStatus();
  const entry = { timestamp: nowIso(), event: "checkpoint", note, task, snapshot };
  appendJsonl(join(stateDir, id, "checkpoints.jsonl"), entry);
  run.updatedAt = entry.timestamp;
  run.checkpoints = [...(run.checkpoints || []), entry].slice(-100);
  saveRun(run);
  writeFileSync(join(stateDir, id, "resume-prompt.md"), renderResumePrompt(run), "utf8");
  output({ ok: true, command, run, checkpoint: entry, findings: [], next: [`Checkpoint recorded. Resume prompt refreshed: ${run.artifacts.resumePrompt}`] }, "long run checkpoint");
}

if (command === "heartbeat") {
  const id = requiredId();
  const run = loadRun(id);
  const status = parseFlag(args, "--status", run.status || "running");
  const note = parseFlag(args, "--note", "heartbeat");
  run.status = status;
  run.updatedAt = nowIso();
  run.checkpoints = [...(run.checkpoints || []), { timestamp: run.updatedAt, status, note }].slice(-100);
  saveRun(run);
  appendJsonl(join(stateDir, id, "heartbeat.jsonl"), { timestamp: run.updatedAt, event: "heartbeat", status, note, task: parseFlag(args, "--task", "") });
  writeFileSync(join(stateDir, id, "resume-prompt.md"), renderResumePrompt(run), "utf8");
  output({ ok: true, command, run, findings: [], next: [`Resume prompt refreshed: ${run.artifacts.resumePrompt}`] }, "long run heartbeat");
}

if (command === "resume") {
  const id = requiredId({ allowLatest: true });
  const run = loadRun(id);
  writeFileSync(join(stateDir, id, "resume-prompt.md"), renderResumePrompt(run), "utf8");
  output({ ok: true, command, run, resumePrompt: readFileSync(join(stateDir, id, "resume-prompt.md"), "utf8"), findings: [], next: [`Open Pi and paste ${run.artifacts.resumePrompt}.`] }, "long run resume");
}

if (command === "list") {
  const runs = listRuns();
  output({ ok: true, command, runs, findings: [] }, "long runs");
}

if (command === "doctor") {
  const runs = listRuns();
  const findings = [];
  for (const run of runs) {
    if (!run.id || !run.goal || !run.status) findings.push(`long run ${run.id || "<missing>"} missing id/goal/status`);
    for (const artifact of Object.values(run.artifacts || {})) {
      if (String(artifact).endsWith("/")) continue;
    }
  }
  output({ ok: findings.length === 0, command, count: runs.length, runs, findings }, "long run doctor");
}

console.error("usage: node scripts/long-run.mjs plan <goal>|checkpoint <id>|heartbeat <id>|resume <id>|list|doctor [--json]");
process.exit(2);

function requiredId(options = {}) {
  const explicit = parseFlag(args, "--id", args.slice(1).find((arg) => !arg.startsWith("--")) || "");
  if (explicit) return explicit;
  if (options.allowLatest) {
    const latest = listRuns()[0]?.id;
    if (latest) return latest;
  }
  output({ ok: false, findings: ["missing long-run id"] }, "long run", 2);
}

function loadRun(id) {
  const run = readJson(join(stateDir, id, "run.json"), null);
  if (!run) output({ ok: false, findings: [`unknown long run: ${id}`] }, "long run", 2);
  return run;
}

function saveRun(run) {
  writeJson(join(stateDir, run.id, "run.json"), run);
}

function listRuns() {
  if (!existsSync(stateDir)) return [];
  return readdirSync(stateDir)
    .map((name) => readJson(join(stateDir, name, "run.json"), null))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function renderPlan(run) {
  return [
    `# Long-Running Harness Plan: ${run.id}`,
    "",
    `- Goal: ${run.goal}`,
    `- Risk: ${run.risk}`,
    `- Status: ${run.status}`,
    `- Created: ${run.createdAt}`,
    `- Heartbeat cadence: every ${run.heartbeatEveryMinutes} minutes while active`,
    `- Budget: ${run.budget?.maxMinutes || 0} minutes / ${run.budget?.maxSessions || 0} sessions / review every ${run.budget?.reviewEveryCheckpoints || 0} checkpoints`,
    "",
    "## Operating Contract",
    "",
    "1. Break work into small harness tasks; each task still needs packet, progress, checks, evidence, and finish gates.",
    "2. Keep durable state in this long-run directory, not only in model context.",
    "3. Record heartbeats after meaningful progress, blockers, handoffs, and before stopping.",
    "4. Use fresh-context review at natural milestones and before risky merges.",
    "5. Prefer checkpoint patches/commits or explicit file lists so recovery is possible.",
    "",
    "## Initial Decomposition",
    "",
    ...renderMilestones(run),
    "",
    "## Recovery Rules",
    "",
    "- Use the resume prompt after every pause or crash.",
    "- Record checkpoints with git status snapshots before risky edits and at handoff boundaries.",
    "- If budget is exceeded, stop and ask the human to re-scope.",
    "",
    "- [ ] Confirm scope and stop conditions.",
    "- [ ] Create the first small task packet.",
    "- [ ] Run project check detection and choose quick/full checks.",
    "- [ ] Add review lane(s) for yellow/red milestones.",
    "- [ ] Refresh the resume prompt after each session.",
    "",
  ].join("\n");
}

function renderMilestones(run) {
  const milestones = Array.isArray(run.milestones) && run.milestones.length ? run.milestones : parseMilestones(run.goal || "work");
  return milestones.map((item, index) => `- [ ] M${index + 1}: ${item}`);
}

function renderRecovery(run) {
  return [
    `# Recovery Guide: ${run.id}`,
    "",
    "Use this when a long-running agent session stops, crashes, or gets confused.",
    "",
    "1. Run `bin/pi-harness next` and inspect open tasks before editing.",
    `2. Read state/long-runs/${run.id}/resume-prompt.md and heartbeat.jsonl.`,
    "3. Check the last checkpoint and current git status.",
    "4. Continue with one small task packet; do not rely on hidden model context.",
    "5. Run deterministic checks and record another checkpoint before stopping.",
    "",
  ].join("\n");
}

function renderResumePrompt(run) {
  const heartbeatPath = join(stateDir, run.id, "heartbeat.jsonl");
  const checkpointPath = join(stateDir, run.id, "checkpoints.jsonl");
  const heartbeats = existsSync(heartbeatPath) ? readFileSync(heartbeatPath, "utf8").trim().split(/\r?\n/).slice(-10) : [];
  const checkpoints = existsSync(checkpointPath) ? readFileSync(checkpointPath, "utf8").trim().split(/\r?\n/).slice(-5) : [];
  return [
    `Resume long-running harness run ${run.id}.`,
    "",
    `Goal: ${run.goal}`,
    `Status: ${run.status}`,
    `Risk: ${run.risk}`,
    `Budget: ${run.budget?.maxMinutes || 0} minutes / ${run.budget?.maxSessions || 0} sessions / review every ${run.budget?.reviewEveryCheckpoints || 0} checkpoints`,
    "",
    "Milestones:",
    ...renderMilestones(run),
    "",
    "Read first:",
    `- state/long-runs/${run.id}/plan.md`,
    `- state/long-runs/${run.id}/heartbeat.jsonl`,
    `- state/long-runs/${run.id}/checkpoints.jsonl if present`,
    `- state/long-runs/${run.id}/recovery.md`,
    "- state/status/latest.json if present",
    "",
    "Recent heartbeats:",
    "",
    "```jsonl",
    ...heartbeats,
    "```",
    "",
    "Recent checkpoints:",
    "",
    "```jsonl",
    ...checkpoints,
    "```",
    "",
    "Instructions:",
    "1. Call harness_status and inspect the active/open task before editing.",
    "2. Continue with the smallest safe next task; do not rely on hidden context.",
    "3. Run deterministic project/harness checks appropriate to the task.",
    "4. Record a checkpoint with `bin/pi-harness run-long-checkpoint <id> --note ...` before risky edits or handoff.",
    "5. Record a heartbeat with `bin/pi-harness run-long-heartbeat` or `node scripts/long-run.mjs heartbeat` before stopping.",
    "6. Use `bin/pi-harness done` for task evidence and finish gates when a task is complete.",
    "",
  ].join("\n");
}

function parseMilestones(goal) {
  const requested = args.filter((arg, index) => args[index - 1] === "--milestone");
  if (requested.length) return requested.slice(0, 12);
  return [
    `Clarify scope for ${goal}`,
    "Create first bounded task packet",
    "Run configured quick checks",
    "Record fresh-context review before risky changes",
    "Prepare handoff and recovery notes",
  ];
}

function gitStatus() {
  const result = spawnSync("git", ["status", "--short"], { cwd: process.env.PI_HARNESS_PROJECT_ROOT || pathFromRoot(), encoding: "utf8", timeout: 10_000, maxBuffer: 256 * 1024 });
  return { git: result.status === 0, status: (result.stdout || "").slice(0, 4000), error: result.status === 0 ? "" : (result.stderr || "git status unavailable").slice(0, 500) };
}

function rel(targetPath) {
  const root = pathFromRoot();
  return String(targetPath).startsWith(root + "/") ? String(targetPath).slice(root.length + 1) : targetPath;
}

function output(result, label, code = undefined) {
  if (json) printResult(result, true, label);
  if (result.ok) console.log(`ok   ${label}`);
  else console.log(`fail ${label}: ${(result.findings || []).join("; ")}`);
  if (result.run) console.log(`${result.run.id}: ${result.run.status} — ${result.run.goal}`);
  if (result.runs?.length) for (const run of result.runs.slice(0, 10)) console.log(`- ${run.id}: ${run.status} — ${run.goal}`);
  if (result.resumePrompt) console.log(result.resumePrompt);
  if (result.next?.length) {
    console.log("Next:");
    for (const step of result.next) console.log(`- ${step}`);
  }
  process.exit(code ?? (result.ok ? 0 : 1));
}
