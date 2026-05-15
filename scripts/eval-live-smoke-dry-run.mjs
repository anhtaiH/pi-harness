import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const result = spawnSync(process.execPath, ["scripts/smoke-live.mjs", "all", "--dry-run", "--json"], { cwd: pathFromRoot(), encoding: "utf8" });
const parsed = JSON.parse(result.stdout || "{}");
const checkIds = (parsed.checks || []).map((check) => check.id);
const ok = result.status === 0
  && parsed.ok === true
  && parsed.mode === "dry-run"
  && checkIds.includes("runtime-policy-env-block")
  && checkIds.includes("external-write-without-intent")
  && checkIds.includes("mcp-discovery-scoped-policy")
  && checkIds.includes("subagent-review-scoped-policy");
console.log(JSON.stringify({ ok, mode: parsed.mode, checkIds, findings: parsed.findings || [] }, null, 2));
process.exit(ok ? 0 : 1);
