import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-external-write-intent";
const taskDir = pathFromRoot("state", "tasks", taskId);

try {
  const recorded = spawnSync(process.execPath, [
    "scripts/external-write.mjs",
    "record",
    "--task",
    taskId,
    "--provider",
    "github",
    "--action",
    "pr-review-comment",
    "--target",
    "PR 123",
    "--reason",
    "eval policy intent",
    "--expected-change",
    "post a review comment",
    "--verification",
    "read back review comment",
    "--rollback",
    "delete or correct comment",
    "--ttl-minutes",
    "5",
    "--json",
  ], {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
  const intent = JSON.parse(recorded.stdout || "{}").entry;
  const result = spawnSync(process.execPath, [
    "scripts/tool-policy.mjs",
    "check",
    "--tool",
    "bash",
    "--task",
    taskId,
    "--input-json",
    JSON.stringify({ command: "gh pr review 123 --comment --body ok" }),
    "--json",
  ], {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
  const policy = JSON.parse(result.stdout || "{}");
  const ok = recorded.status === 0 && result.status === 0 && policy.decision === "audit" && policy.intentId === intent.id;
  console.log(JSON.stringify({ ok, intentId: intent.id, decision: policy.decision, status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(taskDir, { recursive: true, force: true });
}
