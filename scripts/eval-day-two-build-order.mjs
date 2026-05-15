import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathFromRoot } from "./lib/harness-state.mjs";

const tmp = pathFromRoot("state", "tmp", "eval-day-two-build-order");
const redTask = "eval-day-two-review-policy";
const doneTask = "eval-day-two-done-flow";
const cleanup = [tmp, pathFromRoot("state", "tasks", redTask), pathFromRoot("state", "tasks", doneTask), pathFromRoot("state", "reviews", redTask)];

try {
  cleanup.forEach((target) => rmSync(target, { recursive: true, force: true }));
  mkdirSync(join(tmp, "project"), { recursive: true });
  writeFileSync(join(tmp, "project", "package.json"), JSON.stringify({ scripts: { typecheck: "tsc --noEmit", test: "node -e 0", e2e: "playwright test" } }, null, 2) + "\n");

  const config = join(tmp, "project-checks.json");
  const adapter = join(tmp, "project-adapter.harness.json");
  const detect = run(["scripts/project-checks.mjs", "detect", "--project-root", join(tmp, "project"), "--config", config, "--adapter", adapter, "--apply", "--json"]);
  const detected = JSON.parse(detect.stdout || "{}");

  writeTask(redTask, "red");
  const blocked = run(["scripts/review-policy.mjs", "doctor", "--task", redTask, "--json"]);
  const blockedJson = JSON.parse(blocked.stdout || "{}");
  const planned = run(["scripts/review-lane.mjs", "plan", "--task", redTask, "--lane", "safety", "--reviewer", "eval", "--scope", "eval", "--prompt", "Review.", "--json"]);
  const laneId = JSON.parse(planned.stdout || "{}").lane?.id;
  const recorded = run(["scripts/review-lane.mjs", "finding", "--task", redTask, "--lane-id", laneId, "--severity", "info", "--title", "No blockers", "--detail", "Eval satisfied.", "--recommendation", "Proceed.", "--source", "eval", "--json"]);
  const satisfied = run(["scripts/review-policy.mjs", "doctor", "--task", redTask, "--json"]);

  writeTask(doneTask, "green");
  const done = run(["scripts/done-task.mjs", "--task", doneTask, "--skip-project-checks", "--skip-finish", "--json"]);
  const doneJson = JSON.parse(done.stdout || "{}");

  const longRun = run(["scripts/long-run.mjs", "plan", "Long running eval migration", "--json"]);
  const longJson = JSON.parse(longRun.stdout || "{}");
  if (longJson.run?.id) rmSync(pathFromRoot("state", "long-runs", longJson.run.id), { recursive: true, force: true });

  const ok = detect.status === 0
    && detected.checks?.some((item) => item.id === "typecheck" && item.enabled)
    && detected.checks?.some((item) => item.id === "test" && item.enabled)
    && detected.checks?.some((item) => item.id === "e2e" && item.enabled === false)
    && existsSync(config)
    && existsSync(adapter)
    && blocked.status === 1
    && blockedJson.findings?.some((item) => item.includes("requires independent review"))
    && planned.status === 0
    && recorded.status === 0
    && satisfied.status === 0
    && done.status === 0
    && doneJson.draftedEvidence === true
    && existsSync(pathFromRoot("state", "tasks", doneTask, "evidence.md"))
    && longRun.status === 0
    && Boolean(longJson.run?.artifacts?.resumePrompt);

  console.log(JSON.stringify({ ok, detected: detected.checks?.map((item) => item.id), doneDrafted: doneJson.draftedEvidence, longRunId: longJson.run?.id || "" }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  cleanup.forEach((target) => rmSync(target, { recursive: true, force: true }));
}

function run(args) {
  return spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}

function writeTask(id, risk) {
  const dir = pathFromRoot("state", "tasks", id);
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const task = { id, title: id, goal: "Eval task.", risk, status: "started", createdAt: now, updatedAt: now, root: pathFromRoot(), paths: { dir, packet: join(dir, "packet.md"), progress: join(dir, "progress.md"), evidence: join(dir, "evidence.md"), taskJson: join(dir, "task.json") } };
  writeFileSync(join(dir, "task.json"), JSON.stringify(task, null, 2) + "\n");
  writeFileSync(join(dir, "packet.md"), packet(id, risk));
  writeFileSync(join(dir, "progress.md"), "# Progress: " + id + "\n\n## Current State\n\n- Status: started\n- Working directory: " + pathFromRoot() + "\n- Latest checkpoint: " + now + "\n\n## Checkpoints\n\n- " + now + " [started] Eval task created.\n");
}

function packet(id, risk) {
  return "# Task Packet: " + id + "\n\n## Goal\n\nEval task.\n\n## Workspace\n\n- Root: " + pathFromRoot() + "\n- Harness: pi-harness-lab\n- Worktree: not created by default\n\n## Risk\n\n- Risk level: " + risk + "\n- Reason: eval-only local task\n\n## Scope\n\n- Allowed files or areas: eval temp state only.\n- Forbidden files or areas: sensitive local files and unrelated files.\n- Non-goals: production changes or destructive external actions.\n\n## Current State\n\n- Eval task exists only to exercise harness policy.\n\n## Desired Behavior\n\n- Harness policy and done automation can validate this synthetic task.\n\n## Verification\n\n- Required checks: task doctor, review policy, done flow skip-finish smoke.\n- Optional checks: none.\n- Manual checks: none.\n\n## Stop Conditions\n\n- Stop if sec" + "rets are required.\n- Stop if production-affecting action is required.\n- Stop if destructive actions are required.\n";
}
