import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const result = spawnSync(process.execPath, ["scripts/tool-policy.mjs", "doctor", "--json"], {
  cwd: pathFromRoot(),
  encoding: "utf8",
});
const policy = JSON.parse(result.stdout || "{}");
const recommendations = policy.recommendations || [];
const ok = result.status === 0 && recommendations.some((item) => item.includes("pi-mcp-adapter")) && recommendations.some((item) => item.includes("pi-subagents"));
console.log(JSON.stringify({ ok, recommendations }, null, 2));
process.exit(ok ? 0 : 1);
