import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const result = spawnSync(process.execPath, ["scripts/bootstrap.mjs", "--json"], {
  cwd: pathFromRoot(),
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
  timeout: 180_000,
});

let parsed = null;
try {
  parsed = JSON.parse(result.stdout || "{}");
} catch {
  parsed = null;
}

const stepIds = new Set((parsed?.steps || []).map((step) => step.id));
const ok = result.status === 0
  && parsed?.ok === true
  && stepIds.has("state-dirs")
  && stepIds.has("package-manifest")
  && stepIds.has("harness-check")
  && Array.isArray(parsed.nextSteps)
  && parsed.nextSteps.some((step) => step.includes("npm run pi"))
  && existsSync(pathFromRoot("state", "tasks", ".gitkeep"));

console.log(JSON.stringify({
  ok,
  status: result.status,
  stepIds: [...stepIds],
  nextSteps: parsed?.nextSteps || [],
  warnings: parsed?.warnings || [],
  findings: parsed?.findings || [],
}, null, 2));
process.exit(ok ? 0 : 1);
