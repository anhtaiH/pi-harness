import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { commandWithArgs, hasFlag, parseFlag, pathFromRoot, printResult, shellQuote } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const dryRun = hasFlag(args, "--dry-run") || hasFlag(args, "--plan") || hasFlag(args, "--preview");
const targetRoot = resolve(parseFlag(args, "--target", process.cwd()));
const mode = parseFlag(args, "--mode", hasFlag(args, "--repo") ? "repo" : "local");
const install = !dryRun && !hasFlag(args, "--no-install");
const alias = parseFlag(args, "--alias", "ph");
const checksProfile = parseFlag(args, "--checks-profile", "standard");
const noAlias = hasFlag(args, "--no-alias");
const findings = [];
const warnings = [];
const actions = [];

if (!["local", "repo"].includes(mode)) findings.push("--mode must be local or repo");
if (!existsSync(targetRoot)) findings.push("project path does not exist: " + targetRoot);

let adoption = null;
let setup = null;
let sidecarDir = "";
let alreadyConnected = false;

if (findings.length === 0) {
  const existing = readJsonIfExists(pathFromRoot("harness.project.json"));
  alreadyConnected = Boolean(existing?.projectRoot && resolve(existing.projectRoot) === targetRoot && existing.harnessRoot);
  if (alreadyConnected && mode === "local") {
    sidecarDir = pathFromRoot();
    actions.push({ id: "connect-project", title: "Use existing local harness sidecar", status: "ok", applied: true, path: sidecarDir, why: "This project is already connected; start should be idempotent." });
  } else {
    const adoptArgs = ["scripts/adopt-project.mjs", "--target", targetRoot, "--mode", mode, "--json"];
    if (!dryRun) adoptArgs.push("--apply");
    if (hasFlag(args, "--force")) adoptArgs.push("--force");
    if (parseFlag(args, "--scripts", "")) adoptArgs.push("--scripts", parseFlag(args, "--scripts", ""));
    const result = runNode(adoptArgs, 120_000);
    adoption = parseJson(result.stdout);
    if (result.status !== 0 || adoption?.ok === false || !adoption) {
      findings.push(...(adoption?.findings || [commandFailure("project connection", result)]));
    } else {
      sidecarDir = adoption.mode?.sidecarDir || "";
      actions.push({ id: "connect-project", title: dryRun ? "Preview local harness connection" : "Connect local harness", status: "ok", applied: !dryRun, path: sidecarDir, why: "Keep harness code, installs, sessions, and auth outside the project unless repo mode is requested." });
      warnings.push(...(adoption.warnings || []));
    }
  }
}

if (!dryRun && findings.length === 0) {
  const launcher = join(sidecarDir, "bin", "pi-harness");
  if (!existsSync(launcher)) {
    findings.push("launcher was not created: " + launcher);
  } else {
    const setupArgs = ["setup", "--apply", "--checks-profile", checksProfile, "--json"];
    if (install) setupArgs.push("--install");
    if (!noAlias && alias) setupArgs.push("--alias", alias);
    if (noAlias) setupArgs.push("--no-alias");
    const result = spawnSync(launcher, setupArgs, { cwd: targetRoot, encoding: "utf8", timeout: install ? 10 * 60_000 : 120_000, maxBuffer: 8 * 1024 * 1024 });
    setup = parseJson(result.stdout);
    const missingDepsOnly = !install && Array.isArray(setup?.findings) && setup.findings.length > 0 && setup.findings.every((finding) => String(finding).includes("node_modules missing"));
    if ((result.status !== 0 || setup?.ok === false || !setup) && !missingDepsOnly) {
      findings.push(...(setup?.findings || [commandFailure("setup", result)]));
    } else {
      actions.push({ id: "setup-sidecar", title: install ? "Install and set up harness" : "Set up harness", status: missingDepsOnly ? "ok" : "ok", applied: true, path: setup.artifacts?.latest || "state/setup/latest.json", why: install ? "Do the useful default work now so the human does not memorize setup flags." : "Set up local state without installing dependencies because --no-install was requested." });
      warnings.push(...(setup.warnings || []));
      if (missingDepsOnly) warnings.push("Dependencies were not installed because --no-install was requested; run setup --install before launching Pi.");
    }
  }
}

const result = {
  ok: findings.length === 0,
  command: "start",
  dryRun,
  generatedAt: new Date().toISOString(),
  project: { root: targetRoot, name: basename(targetRoot) || "project" },
  mode: { placement: mode, projectWrites: mode === "repo" || parseFlag(args, "--scripts", "none") !== "none", install, alias: noAlias ? "" : alias, checksProfile },
  sidecarDir,
  alreadyConnected,
  actions,
  adoption,
  setup,
  warnings,
  findings,
  next: nextSteps(),
};

if (json) printResult(result, true, "harness start");
printHuman(result);
process.exit(result.ok ? 0 : 1);

function nextSteps() {
  if (findings.length) return ["Fix the blocker above, then rerun the same one-line start command."];
  if (dryRun) return ["Run the same command without --dry-run when you are ready. The default keeps project writes off."];
  const launcher = shellQuote(join(sidecarDir, "bin", "pi-harness"));
  const short = noAlias || !alias ? launcher : alias;
  const steps = [];
  if (!noAlias && setup?.artifacts?.alias) steps.push("Optional short command for this shell: `source " + setup.artifacts.alias + "`.");
  steps.push("Open Pi: `" + short + "`.");
  steps.push("Inside Pi, type `/harness` whenever you are unsure what is possible.");
  steps.push("Need models? `" + short + " models` opens Pi with just-in-time login/model help.");
  steps.push("Need team/research/local models? Try `" + short + " more` to see plain-language options.");
  steps.push("Finish work safely: `" + short + " done`.");
  return steps;
}

function printHuman(result) {
  console.log("Pi Harness Start");
  console.log("================");
  console.log("Project: " + result.project.root);
  console.log("Mode: " + result.mode.placement + " sidecar" + (result.dryRun ? " preview" : ""));
  console.log("Project writes: " + (result.mode.projectWrites ? "yes (explicit mode)" : "none"));
  if (result.sidecarDir) console.log("Harness: " + result.sidecarDir);
  console.log("");
  for (const action of result.actions) {
    const icon = action.status === "ok" ? "✓" : action.status === "failed" ? "✗" : "•";
    console.log(icon + " " + action.title);
    console.log("  " + action.why);
    if (action.path) console.log("  " + action.path);
  }
  if (result.warnings.length) {
    console.log("\nHeads up:");
    for (const warning of result.warnings) console.log("- " + warning);
  }
  if (result.findings.length) {
    console.log("\nNeeds attention:");
    for (const finding of result.findings) console.log("- " + finding);
  }
  console.log("\nNext:");
  for (const step of result.next) console.log("- " + step);
  console.log("");
  console.log(result.ok ? "Ready." : "Start needs attention.");
}

function runNode(commandArgs, timeout) {
  return spawnSync(process.execPath, commandArgs, { cwd: pathFromRoot(), encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
}

function parseJson(text) {
  try { return text && text.trim().startsWith("{") ? JSON.parse(text) : null; } catch { return null; }
}

function commandFailure(label, result) {
  const parts = [`${label} exited ${result.status}`];
  if (result.signal) parts.push(`signal ${result.signal}`);
  if (result.error?.code) parts.push(result.error.code);
  const detail = String(result.stderr || result.stdout || result.error?.message || "").trim().slice(0, 400);
  if (detail) parts.push(detail);
  return parts.join(": ");
}

function readJsonIfExists(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}
