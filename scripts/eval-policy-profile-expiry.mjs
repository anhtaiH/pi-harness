import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const expiredTask = "eval-policy-profile-expired";
const doneTask = "eval-policy-profile-clear-on-finish";
const outputs = [];

try {
  makeTask(expiredTask, "eval");
  makeTask(doneTask, "done");
  const past = "2000-01-01T00:00:00.000Z";
  const applyExpired = run(["scripts/policy-profile.mjs", "apply", "--task", expiredTask, "--profile", "mcp-discovery", "--expires-at", past, "--json"]);
  const expiredTool = run(["scripts/tool-policy.mjs", "check", "--tool", "mcp", "--task", expiredTask, "--input-json", "{}", "--json"]);
  const doctorExpired = run(["scripts/policy-profile.mjs", "doctor", "--json"]);
  const applyDone = run(["scripts/policy-profile.mjs", "apply", "--task", doneTask, "--profile", "subagent-review", "--ttl-minutes", "60", "--clear-on-finish", "--json"]);
  const pruneDry = run(["scripts/policy-profile.mjs", "prune", "--dry-run", "--json"]);
  const prune = run(["scripts/policy-profile.mjs", "prune", "--json"]);
  const donePolicyRemoved = !existsSync(join(pathFromRoot("state", "tasks", doneTask), "tool-policy.json"));
  const ok = applyExpired.status === 0
    && expiredTool.status === 1
    && expiredTool.stdout.includes("allowlist")
    && doctorExpired.status === 1
    && doctorExpired.stdout.includes("expired")
    && applyDone.status === 0
    && pruneDry.status === 0
    && pruneDry.stdout.includes("done-clear-on-finish")
    && prune.status === 0
    && donePolicyRemoved;
  console.log(JSON.stringify({ ok, donePolicyRemoved, outputs: outputs.map(summarize) }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(pathFromRoot("state", "tasks", expiredTask), { recursive: true, force: true });
  rmSync(pathFromRoot("state", "tasks", doneTask), { recursive: true, force: true });
}

function makeTask(id, status) {
  const dir = pathFromRoot("state", "tasks", id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "task.json"), `${JSON.stringify({ id, title: id, risk: "green", status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8" });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result;
}

function summarize(item) {
  return { args: item.args, status: item.status, stdout: item.stdout.slice(0, 500), stderr: item.stderr.slice(0, 300) };
}
