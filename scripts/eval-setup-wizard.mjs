import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    parsed = null;
  }
  return { args, status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

const plan = run(["scripts/setup-wizard.mjs", "--json"]);
const applied = run(["scripts/setup-wizard.mjs", "--apply", "--json"]);
const promptPath = pathFromRoot("state", "setup", "agent-prompt.md");
const latestPath = pathFromRoot("state", "setup", "latest.json");
const packageJson = JSON.parse(readFileSync(pathFromRoot("package.json"), "utf8"));
const scripts = packageJson.scripts || {};
const promptText = existsSync(promptPath) ? readFileSync(promptPath, "utf8") : "";
const latest = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, "utf8")) : null;

const planIds = (plan.parsed?.actions || []).map((action) => action.id);
const appliedActions = applied.parsed?.actions || [];
const ok = plan.status === 0
  && applied.status === 0
  && plan.parsed?.mode?.apply === false
  && applied.parsed?.mode?.apply === true
  && planIds.includes("inspect-repo")
  && planIds.includes("bootstrap-local-state")
  && planIds.includes("capability-guidance")
  && planIds.includes("agent-continuation-prompt")
  && appliedActions.some((action) => action.id === "bootstrap-local-state" && action.status === "ok")
  && appliedActions.some((action) => action.id === "verify-readiness" && action.status === "ok")
  && appliedActions.some((action) => action.id === "capability-guidance" && action.status === "ok" && action.capabilities?.length === 3)
  && appliedActions.some((action) => action.id === "agent-continuation-prompt" && action.applied === true)
  && !scripts["harness:capabilities"]
  && !scripts["harness:models"]
  && !scripts["harness:team"]
  && !scripts["harness:research"]
  && promptText.includes("agent-driven, transparent wizard")
  && latest?.ok === true;

console.log(JSON.stringify({
  ok,
  planStatus: plan.status,
  appliedStatus: applied.status,
  planActionIds: planIds,
  appliedActionStatuses: appliedActions.map((action) => ({ id: action.id, status: action.status, applied: action.applied })),
  capabilityAction: appliedActions.find((action) => action.id === "capability-guidance")?.capabilities?.map((item) => item.id),
  removedCapabilityAliases: !scripts["harness:capabilities"] && !scripts["harness:models"] && !scripts["harness:team"] && !scripts["harness:research"],
  promptExists: existsSync(promptPath),
  latestOk: latest?.ok,
}, null, 2));
process.exit(ok ? 0 : 1);
