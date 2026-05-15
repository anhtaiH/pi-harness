import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-policy-profile-flow";
const taskDir = pathFromRoot("state", "tasks", taskId);
const outputs = [];

try {
  rmSync(taskDir, { recursive: true, force: true });
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, "task.json"), `${JSON.stringify({ id: taskId, title: "eval-policy-profile-flow", risk: "green", status: "eval", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");

  const globalMcp = run(["scripts/tool-policy.mjs", "check", "--tool", "mcp", "--input-json", "{}", "--json"]);
  const apply = run(["scripts/policy-profile.mjs", "apply", "--task", taskId, "--profile", "mcp-discovery", "--json"]);
  const scopedMcp = run(["scripts/tool-policy.mjs", "check", "--tool", "mcp", "--task", taskId, "--input-json", "{}", "--json"]);
  const secretRead = run(["scripts/tool-policy.mjs", "check", "--tool", "read", "--task", taskId, "--input-json", '{"path":".env"}', "--json"]);
  const directMissingTools = run(["scripts/policy-profile.mjs", "apply", "--task", taskId, "--profile", "mcp-direct-selected", "--json"]);
  const directApply = run(["scripts/policy-profile.mjs", "apply", "--task", taskId, "--profile", "mcp-direct-selected", "--tools", "server_docs_search", "--json"]);
  const directAllowed = run(["scripts/tool-policy.mjs", "check", "--tool", "server_docs_search", "--task", taskId, "--input-json", "{}", "--json"]);
  const doctor = run(["scripts/policy-profile.mjs", "doctor", "--json"]);

  const ok = globalMcp.status === 1
    && apply.status === 0
    && scopedMcp.status === 0
    && secretRead.status === 1
    && secretRead.stdout.includes("secret-bearing path")
    && directMissingTools.status === 1
    && directApply.status === 0
    && directAllowed.status === 0
    && doctor.status === 0;
  console.log(JSON.stringify({ ok, outputs: outputs.map(summarize) }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(taskDir, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8" });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result;
}

function summarize(item) {
  return { args: item.args, status: item.status, stdout: item.stdout.slice(0, 300), stderr: item.stderr.slice(0, 300) };
}
