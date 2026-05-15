import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-tool-policy-metadata";
const dir = pathFromRoot("state", "tasks", taskId);
const outputs = [];

try {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "task.json"), `${JSON.stringify({ id: taskId, title: taskId, risk: "green", status: "eval", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  const apply = run(["scripts/policy-profile.mjs", "apply", "--task", taskId, "--profile", "mcp-direct-selected", "--tools", "sandbox_docs_search,sandbox_issue_comment", "--json"]);
  const readOnly = run(["scripts/tool-policy.mjs", "check", "--tool", "sandbox_docs_search", "--task", taskId, "--input-json", "{\"query\":\"policy\"}", "--json"]);
  const writeBlocked = run(["scripts/tool-policy.mjs", "check", "--tool", "sandbox_issue_comment", "--task", taskId, "--input-json", "{\"issue\":\"123\",\"body\":\"safe test\"}", "--json"]);
  const intent = run([
    "scripts/external-write.mjs", "record", "--task", taskId,
    "--provider", "mcp-sandbox", "--action", "issue-comment", "--target", "sandbox-issue-123",
    "--reason", "eval metadata intent", "--expected-change", "mock comment only", "--verification", "tool-policy audit only", "--rollback", "no-op sandbox", "--ttl-minutes", "5", "--json",
  ]);
  const writeAudited = run(["scripts/tool-policy.mjs", "check", "--tool", "sandbox_issue_comment", "--task", taskId, "--input-json", "{\"issue\":\"123\",\"body\":\"safe test\"}", "--json"]);
  const ok = apply.status === 0
    && readOnly.status === 0
    && readOnly.stdout.includes("risky-tool")
    && writeBlocked.status === 1
    && writeBlocked.stdout.includes("external-write")
    && intent.status === 0
    && writeAudited.status === 0
    && writeAudited.stdout.includes("external write-like tool has task intent");
  console.log(JSON.stringify({ ok, outputs: outputs.map(summarize) }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8" });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result;
}

function summarize(item) {
  return { args: item.args, status: item.status, stdout: item.stdout.slice(0, 500), stderr: item.stderr.slice(0, 300) };
}
