import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-task-doctor";
const taskDir = pathFromRoot("state", "tasks", taskId);

try {
  mkdirSync(taskDir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(taskDir, "task.json"), `${JSON.stringify({
    id: taskId,
    title: "eval-task-doctor",
    goal: "Validate task doctor fixtures.",
    risk: "green",
    createdAt: now,
    updatedAt: now,
    root: pathFromRoot(),
    paths: {
      dir: taskDir,
      packet: join(taskDir, "packet.md"),
      progress: join(taskDir, "progress.md"),
      evidence: join(taskDir, "evidence.md"),
      taskJson: join(taskDir, "task.json"),
    },
  }, null, 2)}\n`, "utf8");
  writePacket("Implement local eval fixture.");
  writeFileSync(join(taskDir, "progress.md"), `# Progress: ${taskId}\n\n## Current State\n\n- Status: started\n\n## Checkpoints\n\n- ${now} [started] Task packet created.\n`, "utf8");

  const pass = runDoctor();
  writePacket("Define exact expected behavior before implementation.");
  const fail = runDoctor();
  const ok = pass.status === 0 && fail.status === 1 && JSON.parse(pass.stdout).ok && !JSON.parse(fail.stdout).ok;
  console.log(JSON.stringify({ ok, passStatus: pass.status, failStatus: fail.status, failFindings: JSON.parse(fail.stdout).findings }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(taskDir, { recursive: true, force: true });
}

function writePacket(desiredBehavior) {
  writeFileSync(join(taskDir, "packet.md"), `# Task Packet: ${taskId}

## Goal

Validate task doctor fixtures.

## Workspace

- Root: ${pathFromRoot()}
- Harness: pi-harness-lab
- Worktree: not created by default

## Risk

- Risk level: green
- Reason: eval fixture

## Scope

- Allowed files or areas: eval fixture files.
- Forbidden files or areas: credentials, auth files, token stores.
- Non-goals: production writes.

## Current State

- Created from eval fixture.

## Desired Behavior

- ${desiredBehavior}

## Verification

- Required checks: task doctor pass and fail fixture.
- Optional checks: none.
- Manual checks: none.

## Stop Conditions

- Stop if secrets are required.
- Stop if production-affecting actions are required.
- Stop if destructive actions are required outside the active task scope.
`, "utf8");
}

function runDoctor() {
  return spawnSync(process.execPath, ["scripts/task-doctor.mjs", taskId, "--json"], {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
}
