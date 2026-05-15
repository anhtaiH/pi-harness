import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const status = spawnSync(process.execPath, ["scripts/status.mjs"], { cwd: pathFromRoot(), encoding: "utf8" });
const jsonPath = pathFromRoot("state", "status", "latest.json");
const htmlPath = pathFromRoot("state", "status", "index.html");
const statusJson = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, "utf8")) : null;
const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
const ok = status.status === 0
  && Boolean(statusJson?.generatedAt)
  && Boolean(statusJson?.health)
  && Number.isFinite(statusJson?.health?.openTasks)
  && Boolean(statusJson?.memory)
  && Boolean(statusJson?.reviews)
  && Boolean(statusJson?.policyProfiles)
  && Boolean(statusJson?.externalWrites)
  && Array.isArray(statusJson?.nextActions)
  && statusJson.nextActions.length > 0
  && statusJson.tasks?.every((task) => task.status && task.risk)
  && html.includes("Policy profiles")
  && html.includes("External writes")
  && html.includes("Review lanes/runs/findings")
  && html.includes("Health:")
  && html.includes("Next actions")
  && html.includes("Artifacts");
console.log(JSON.stringify({
  ok,
  status: status.status,
  hasJson: Boolean(statusJson),
  health: statusJson?.health,
  htmlChecks: {
    policy: html.includes("Policy profiles"),
    external: html.includes("External writes"),
    reviews: html.includes("Review lanes/runs/findings"),
    health: html.includes("Health:"),
    nextActions: html.includes("Next actions"),
    artifacts: html.includes("Artifacts"),
  },
  labels: ["Policy profiles", "External writes", "Review lanes/runs/findings", "Health", "Next actions", "Artifacts"],
}, null, 2));
process.exit(ok ? 0 : 1);
