import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const outputs = [];
const list = run(["scripts/mcp-sandbox.mjs", "list", "--json"]);
const docs = run(["scripts/mcp-sandbox.mjs", "call", "--tool", "sandbox_docs_search", "--query", "policy profiles", "--json"]);
const writeLike = run(["scripts/mcp-sandbox.mjs", "call", "--tool", "sandbox_issue_comment", "--query", "no-op", "--json"]);
const doctor = run(["scripts/mcp-sandbox.mjs", "doctor", "--json"]);
const listJson = JSON.parse(list.stdout || "{}");
const docsJson = JSON.parse(docs.stdout || "{}");
const writeJson = JSON.parse(writeLike.stdout || "{}");
const ok = list.status === 0
  && listJson.serverCount === 1
  && listJson.toolCount >= 3
  && docs.status === 0
  && docsJson.result?.matches?.length > 0
  && writeLike.status === 1
  && writeJson.blockedBySandbox === true
  && doctor.status === 0;
console.log(JSON.stringify({ ok, toolCount: listJson.toolCount, docsResult: docsJson.result, writeReason: writeJson.reason, outputs: outputs.map(summarize) }, null, 2));
process.exit(ok ? 0 : 1);

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8" });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result;
}

function summarize(item) {
  return { args: item.args, status: item.status, stdout: item.stdout.slice(0, 300), stderr: item.stderr.slice(0, 300) };
}
