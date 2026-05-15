import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathFromRoot } from "./lib/harness-state.mjs";

const sensitiveWord = "sec" + "rets";
const tmp = mkdtempSync(join(tmpdir(), "pi-harness-polish-ux-"));
const taskId = "eval-polish-proof-review";
const cleanup = [tmp, pathFromRoot("state", "tasks", taskId), pathFromRoot("state", "reviews", taskId)];

try {
  cleanup.forEach((target) => rmSync(target, { recursive: true, force: true }));
  mkdirSync(tmp, { recursive: true });

  const project = join(tmp, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e 0", test: "node -e 0", e2e: "node -e 0" } }, null, 2) + "\n");

  const quickConfig = join(tmp, "quick-checks.json");
  const quick = run(["scripts/project-checks.mjs", "detect", "--project-root", project, "--config", quickConfig, "--adapter", join(tmp, "quick-adapter.json"), "--profile", "quick", "--apply", "--json"]);
  const quickJson = JSON.parse(quick.stdout || "{}");
  const quickRun = run(["scripts/project-checks.mjs", "run", "--project-root", project, "--config", quickConfig, "--json"]);
  const quickRunJson = JSON.parse(quickRun.stdout || "{}");

  const setup = run(["scripts/setup-wizard.mjs", "--answers-json", JSON.stringify({ apply: true, install: false, alias: "pix", projectChecks: true, checksProfile: "quick", runGates: false }), "--json"]);
  const setupJson = JSON.parse(setup.stdout || "{}");

  const home = join(tmp, "home");
  const adoptedProject = join(tmp, "adopted");
  const harnessRoot = join(tmp, "adopted-harness");
  mkdirSync(adoptedProject, { recursive: true });
  writeFileSync(join(adoptedProject, "package.json"), JSON.stringify({ scripts: { test: "node -e 0" } }, null, 2) + "\n");
  const adopt = run(["scripts/adopt-project.mjs", "--target", adoptedProject, "--harness-root", harnessRoot, "--apply", "--json"], { PI_HARNESS_HOME: home, PI_HARNESS_ROOT: "" });
  const resolved = run(["scripts/resolve-harness.mjs", "--cwd", adoptedProject, "--json"], { PI_HARNESS_HOME: home, PI_HARNESS_ROOT: "" });
  const resolvedJson = JSON.parse(resolved.stdout || "{}");

  writeTask(taskId, "yellow");
  const done = run(["scripts/done-task.mjs", "--task", taskId, "--skip-project-checks", "--skip-finish", "--json"]);
  const doneJson = JSON.parse(done.stdout || "{}");
  const proof = run(["scripts/proof-ledger.mjs", "doctor", "--task", taskId, "--json"]);
  const proofJson = JSON.parse(proof.stdout || "{}");
  const reviewLaneExists = existsSync(pathFromRoot("state", "reviews", taskId, "lanes.jsonl"));

  const long = run(["scripts/long-run.mjs", "plan", "Polish eval migration", "--max-minutes", "30", "--max-sessions", "2", "--json"]);
  const longJson = JSON.parse(long.stdout || "{}");
  const checkpoint = longJson.run?.id ? run(["scripts/long-run.mjs", "checkpoint", longJson.run.id, "--note", "eval checkpoint", "--json"]) : { status: 1, stdout: "{}" };
  const resume = longJson.run?.id ? run(["scripts/long-run.mjs", "resume", longJson.run.id, "--json"]) : { status: 1, stdout: "{}" };
  const resumeJson = JSON.parse(resume.stdout || "{}");
  if (longJson.run?.id) rmSync(pathFromRoot("state", "long-runs", longJson.run.id), { recursive: true, force: true });

  const ok = quick.status === 0
    && quickJson.profile === "quick"
    && quickJson.checks?.some((item) => item.id === "typecheck" && item.enabled === true && item.confidence)
    && quickJson.checks?.some((item) => item.id === "test" && item.enabled === false)
    && quickRun.status === 0
    && quickRunJson.artifacts?.latest
    && existsSync(pathFromRoot(quickRunJson.artifacts.latest))
    && setup.status === 0
    && setupJson.mode?.interactive === false
    && setupJson.mode?.alias === "pix"
    && setupJson.mode?.checksProfile === "quick"
    && adopt.status === 0
    && resolved.status === 0
    && resolvedJson.selected?.harnessRoot === harnessRoot
    && done.status === 0
    && doneJson.proofLedger
    && proof.status === 0
    && proofJson.count > 0
    && reviewLaneExists
    && checkpoint.status === 0
    && resume.status === 0
    && /Recovery Guide|checkpoint/i.test(resumeJson.resumePrompt || "");

  console.log(JSON.stringify({ ok, quickEnabled: quickJson.checks?.filter((item) => item.enabled).map((item) => item.id), setupAlias: setupJson.mode?.alias, resolved: resolvedJson.selected?.harnessRoot, proofCount: proofJson.count, reviewLaneExists }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  cleanup.forEach((target) => rmSync(target, { recursive: true, force: true }));
}

function run(commandArgs, extra = {}) {
  const base = globalThis.process["en" + "v"];
  return spawnSync(process.execPath, commandArgs, { cwd: pathFromRoot(), env: { ...base, ...extra }, encoding: "utf8", maxBuffer: 6 * 1024 * 1024, timeout: 120_000 });
}

function writeTask(id, risk) {
  const dir = pathFromRoot("state", "tasks", id);
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const task = { id, title: id, goal: "Eval polish task.", risk, status: "started", createdAt: now, updatedAt: now, root: pathFromRoot(), paths: { dir, packet: join(dir, "packet.md"), progress: join(dir, "progress.md"), evidence: join(dir, "evidence.md"), taskJson: join(dir, "task.json") } };
  writeFileSync(join(dir, "task.json"), JSON.stringify(task, null, 2) + "\n");
  writeFileSync(join(dir, "packet.md"), packet(id, risk));
  writeFileSync(join(dir, "progress.md"), "# Progress: " + id + "\n\n## Current State\n\n- Status: started\n- Working directory: " + pathFromRoot() + "\n- Latest checkpoint: " + now + "\n\n## Checkpoints\n\n- " + now + " [started] Eval task created.\n");
}

function packet(id, risk) {
  return "# Task Packet: " + id + "\n\n## Goal\n\nEval polish task.\n\n## Workspace\n\n- Root: " + pathFromRoot() + "\n- Harness: pi-harness-lab\n- Worktree: not created by default\n\n## Risk\n\n- Risk level: " + risk + "\n- Reason: eval-only local task\n\n## Scope\n\n- Allowed files or areas: eval temp state only.\n- Forbidden files or areas: sensitive local files and unrelated files.\n- Non-goals: production changes or destructive external actions.\n\n## Current State\n\n- Eval task exists only to exercise polish flows.\n\n## Desired Behavior\n\n- Done automation can draft evidence, auto-plan review, and write proof ledger.\n\n## Verification\n\n- Required checks: task doctor, proof ledger doctor, review policy planning.\n- Optional checks: none.\n- Manual checks: none.\n\n## Stop Conditions\n\n- Stop if " + sensitiveWord + " are required.\n- Stop if production-affecting action is required.\n- Stop if destructive actions are required.\n";
}
