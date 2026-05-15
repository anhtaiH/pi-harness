import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const result = spawnSync(process.execPath, ["scripts/tool-policy.mjs", "metadata", "--json"], { cwd: pathFromRoot(), encoding: "utf8" });
const parsed = JSON.parse(result.stdout || "{}");
const patterns = (parsed.entries || []).map((entry) => entry.pattern);
const ok = result.status === 0
  && parsed.ok === true
  && parsed.summary?.readOnly >= 1
  && parsed.summary?.externalWrite >= 1
  && patterns.includes("slack_post_message")
  && patterns.includes("github_issues_list");
console.log(JSON.stringify({ ok, status: result.status, summary: parsed.summary, patterns, findings: parsed.findings || [] }, null, 2));
process.exit(ok ? 0 : 1);
