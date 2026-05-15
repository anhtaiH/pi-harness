import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-external-write-doctor";
const taskDir = pathFromRoot("state", "tasks", taskId);

try {
  const record = run([
    "scripts/external-write.mjs",
    "record",
    "--task",
    taskId,
    "--provider",
    "github",
    "--action",
    "pr-comment",
    "--target",
    "PR 456",
    "--reason",
    "eval doctor intent",
    "--expected-change",
    "write a comment",
    "--verification",
    "read back the comment",
    "--rollback",
    "delete or amend the comment",
    "--json",
  ]);
  const intentId = JSON.parse(record.stdout).entry.id;
  const openDoctor = run(["scripts/external-write.mjs", "doctor", "--task", taskId, "--json"]);
  const proof = run([
    "scripts/external-write.mjs",
    "proof",
    "--task",
    taskId,
    "--intent",
    intentId,
    "--command",
    "inspection only",
    "--result",
    "verified",
    "--read-back",
    "external system showed expected change",
    "--json",
  ]);
  const closedDoctor = run(["scripts/external-write.mjs", "doctor", "--task", taskId, "--json"]);
  const open = JSON.parse(openDoctor.stdout || "{}");
  const closed = JSON.parse(closedDoctor.stdout || "{}");
  const ok = record.status === 0 && proof.status === 0 && openDoctor.status === 1 && closedDoctor.status === 0 && !open.ok && closed.ok;
  console.log(JSON.stringify({ ok, openFinding: open.findings?.[0], closedOk: closed.ok }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(taskDir, { recursive: true, force: true });
}

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
}
