import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathFromRoot } from "./lib/harness-state.mjs";

const tmp = mkdtempSync(join(tmpdir(), "pi-harness-adopt-"));
writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "adopt-target", version: "0.0.0", scripts: { test: "echo ok" } }, null, 2) + "\n");

const plan = run(["scripts/adopt-project.mjs", "--target", tmp, "--json"]);
const apply = run(["scripts/adopt-project.mjs", "--target", tmp, "--apply", "--json"]);
const setup = spawnSync("npm", ["run", "harness:setup", "--", "--json"], { cwd: tmp, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const setupParsed = parseNpmJson(setup.stdout);
const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf8"));
const scripts = pkg.scripts || {};
const sidecar = join(tmp, ".pi-harness");
const copiedHarness = existsSync(join(sidecar, "scripts", "setup-wizard.mjs")) && existsSync(join(sidecar, "bin", "pi-harness"));
const setupPlanHasCapabilities = (setupParsed?.actions || []).some((action) => action.id === "capability-guidance" && action.capabilities?.length === 3);

const ok = plan.status === 0
  && apply.status === 0
  && plan.parsed?.ok === true
  && apply.parsed?.ok === true
  && copiedHarness
  && scripts["harness:setup"] === "node .pi-harness/scripts/setup-wizard.mjs"
  && scripts.pi === "./.pi-harness/bin/pi-harness"
  && setup.status === 0
  && setupParsed?.ok === true
  && setupPlanHasCapabilities;

console.log(JSON.stringify({
  ok,
  target: tmp,
  planStatus: plan.status,
  applyStatus: apply.status,
  setupStatus: setup.status,
  copiedHarness,
  scriptNames: Object.keys(scripts).sort(),
  setupPlanHasCapabilities,
  findings: [
    ...(plan.parsed?.findings || []),
    ...(apply.parsed?.findings || []),
    ...(setupParsed?.findings || []),
  ],
}, null, 2));
process.exit(ok ? 0 : 1);

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed: parseJson(result.stdout) };
}

function parseJson(text) {
  try { return JSON.parse(text || "{}"); } catch { return null; }
}

function parseNpmJson(text) {
  const start = String(text || "").indexOf("{");
  if (start < 0) return null;
  return parseJson(String(text).slice(start));
}
