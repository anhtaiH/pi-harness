import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const localTarget = makeTarget("pi-harness-adopt-local-");
const localHarness = mkdtempSync(join(tmpdir(), "pi-harness-local-root-"));
const localPlan = run(["scripts/adopt-project.mjs", "--target", localTarget, "--harness-root", localHarness, "--json"]);
const localApply = run(["scripts/adopt-project.mjs", "--target", localTarget, "--harness-root", localHarness, "--apply", "--json"]);
const localLauncher = join(localHarness, "bin", "pi-harness");
const localSetup = spawnSync(localLauncher, ["setup", "--json"], { cwd: localTarget, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const localSetupParsed = parseJson(localSetup.stdout);
const localPkg = JSON.parse(readFileSync(join(localTarget, "package.json"), "utf8"));
const localInstallAction = (localSetupParsed?.actions || []).find((action) => action.id === "install-dependencies");
const localSetupPlanHasCapabilities = (localSetupParsed?.actions || []).some((action) => action.id === "capability-guidance" && action.capabilities?.length === 3);
const localMetadata = parseJsonFile(join(localHarness, "harness.project.json"));
const localOk = localPlan.status === 0
  && localApply.status === 0
  && localPlan.parsed?.ok === true
  && localApply.parsed?.ok === true
  && localPlan.parsed?.mode?.adoptionMode === "local"
  && localApply.parsed?.mode?.projectWrites === false
  && !existsSync(join(localTarget, ".pi-harness"))
  && localPkg.scripts?.test === "echo ok"
  && !localPkg.scripts?.pi
  && existsSync(join(localHarness, "scripts", "setup-wizard.mjs"))
  && existsSync(localLauncher)
  && existsSync(join(localHarness, "pnpm-lock.yaml"))
  && existsSync(join(localHarness, "AGENTS.md"))
  && existsSync(join(localHarness, ".github", "workflows", "pi-harness-gates.yml"))
  && localMetadata?.adoptionMode === "local"
  && localMetadata?.projectRoot === localTarget
  && localSetup.status === 0
  && localSetupParsed?.ok === true
  && localInstallAction?.packageManager?.name === "pnpm"
  && localSetupPlanHasCapabilities;

const repoTarget = makeTarget("pi-harness-adopt-repo-");
const repoPlan = run(["scripts/adopt-project.mjs", "--target", repoTarget, "--mode", "repo", "--json"]);
const repoApply = run(["scripts/adopt-project.mjs", "--target", repoTarget, "--mode", "repo", "--apply", "--json"]);
const repoSetup = spawnSync("npm", ["run", "harness:setup", "--", "--json"], { cwd: repoTarget, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const repoSetupParsed = parseNpmJson(repoSetup.stdout);
const repoPkg = JSON.parse(readFileSync(join(repoTarget, "package.json"), "utf8"));
const repoScripts = repoPkg.scripts || {};
const repoSidecar = join(repoTarget, ".pi-harness");
const repoCopiedHarness = existsSync(join(repoSidecar, "scripts", "setup-wizard.mjs")) && existsSync(join(repoSidecar, "bin", "pi-harness"));
const repoCopiedPnpmLock = existsSync(join(repoSidecar, "pnpm-lock.yaml"));
const repoCopiedManifestSupport = existsSync(join(repoSidecar, "AGENTS.md")) && existsSync(join(repoSidecar, ".github", "workflows", "pi-harness-gates.yml"));
const repoSetupPlanHasCapabilities = (repoSetupParsed?.actions || []).some((action) => action.id === "capability-guidance" && action.capabilities?.length === 3);
const repoInstallAction = (repoSetupParsed?.actions || []).find((action) => action.id === "install-dependencies");
const repoOk = repoPlan.status === 0
  && repoApply.status === 0
  && repoPlan.parsed?.ok === true
  && repoApply.parsed?.ok === true
  && repoPlan.parsed?.mode?.adoptionMode === "repo"
  && repoApply.parsed?.mode?.projectWrites === true
  && repoCopiedHarness
  && repoCopiedPnpmLock
  && repoCopiedManifestSupport
  && repoInstallAction?.packageManager?.name === "pnpm"
  && repoScripts["harness:setup"] === "node .pi-harness/scripts/setup-wizard.mjs"
  && repoScripts.pi === "./.pi-harness/bin/pi-harness"
  && repoSetup.status === 0
  && repoSetupParsed?.ok === true
  && repoSetupPlanHasCapabilities;

const ok = localOk && repoOk;
console.log(JSON.stringify({
  ok,
  local: {
    target: localTarget,
    harness: localHarness,
    planStatus: localPlan.status,
    applyStatus: localApply.status,
    setupStatus: localSetup.status,
    projectWrites: localApply.parsed?.mode?.projectWrites,
    projectSidecarExists: existsSync(join(localTarget, ".pi-harness")),
    metadataMode: localMetadata?.adoptionMode,
    installAction: localInstallAction ? { command: localInstallAction.command, packageManager: localInstallAction.packageManager } : null,
    setupPlanHasCapabilities: localSetupPlanHasCapabilities,
  },
  repo: {
    target: repoTarget,
    planStatus: repoPlan.status,
    applyStatus: repoApply.status,
    setupStatus: repoSetup.status,
    copiedHarness: repoCopiedHarness,
    copiedPnpmLock: repoCopiedPnpmLock,
    copiedManifestSupport: repoCopiedManifestSupport,
    installAction: repoInstallAction ? { command: repoInstallAction.command, packageManager: repoInstallAction.packageManager } : null,
    scriptNames: Object.keys(repoScripts).sort(),
    setupPlanHasCapabilities: repoSetupPlanHasCapabilities,
  },
  findings: [
    ...(localPlan.parsed?.findings || []),
    ...(localApply.parsed?.findings || []),
    ...(localSetupParsed?.findings || []),
    ...(repoPlan.parsed?.findings || []),
    ...(repoApply.parsed?.findings || []),
    ...(repoSetupParsed?.findings || []),
  ],
}, null, 2));
process.exit(ok ? 0 : 1);

function makeTarget(prefix) {
  const tmp = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "adopt-target", version: "0.0.0", scripts: { test: "echo ok" } }, null, 2) + "\n");
  return tmp;
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed: parseJson(result.stdout) };
}

function parseJson(text) {
  try { return JSON.parse(text || "{}"); } catch { return null; }
}

function parseJsonFile(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function parseNpmJson(text) {
  const start = String(text || "").indexOf("{");
  if (start < 0) return null;
  return parseJson(String(text).slice(start));
}
