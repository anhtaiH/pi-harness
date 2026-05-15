import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    parsed = null;
  }
  return { args, status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

const next = run(["scripts/harnessctl.mjs", "next", "--json"]);
const check = run(["scripts/harnessctl.mjs", "check", "--json"]);
const status = run(["scripts/status.mjs", "--json"]);
const ok = next.status === 0
  && check.status === 0
  && status.status === 0
  && Array.isArray(next.parsed?.nextActions)
  && next.parsed.nextActions.length > 0
  && check.parsed?.checks?.some((item) => item.id === "tool-policy")
  && Boolean(status.parsed?.nextActions?.length);

console.log(JSON.stringify({
  ok,
  nextStatus: next.status,
  checkStatus: check.status,
  statusJsonStatus: status.status,
  nextActions: next.parsed?.nextActions || [],
  checkIds: check.parsed?.checks?.map((item) => item.id) || [],
}, null, 2));
process.exit(ok ? 0 : 1);
