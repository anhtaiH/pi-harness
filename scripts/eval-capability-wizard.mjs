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
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

const plan = run(["scripts/capability-wizard.mjs", "all", "--json"]);
const apply = run(["scripts/capability-wizard.mjs", "all", "--apply", "--json"]);
const latestPath = pathFromRoot("state", "setup", "capabilities", "latest.json");
const teamPrompt = pathFromRoot("state", "setup", "capabilities", "team-prompt.md");
const researchPrompt = pathFromRoot("state", "setup", "capabilities", "research-prompt.md");
const latest = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, "utf8")) : null;
const cardIds = (plan.parsed?.cards || []).map((card) => card.id);
const team = (apply.parsed?.cards || []).find((card) => card.id === "team");
const research = (apply.parsed?.cards || []).find((card) => card.id === "research");

const ok = plan.status === 0
  && apply.status === 0
  && cardIds.includes("models")
  && cardIds.includes("team")
  && cardIds.includes("research")
  && team?.current?.subagents?.configured === true
  && team?.current?.intercom?.vendored === true
  && research?.current?.webAccess?.configured === true
  && research?.current?.promptWorkflows?.vendored === true
  && existsSync(teamPrompt)
  && existsSync(researchPrompt)
  && latest?.ok === true;

console.log(JSON.stringify({
  ok,
  planStatus: plan.status,
  applyStatus: apply.status,
  cardIds,
  teamStatus: team?.status,
  researchStatus: research?.status,
  artifacts: apply.parsed?.artifacts || [],
}, null, 2));
process.exit(ok ? 0 : 1);
