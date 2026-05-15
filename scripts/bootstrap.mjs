import { constants, existsSync, mkdirSync, readFileSync, writeFileSync, accessSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { hasFlag, pathFromRoot } from "./lib/harness-state.mjs";
import { installCommandText, selectPackageManager } from "./lib/package-manager.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const install = hasFlag(args, "--install");
const offline = hasFlag(args, "--offline");
const runGates = hasFlag(args, "--run-gates");
const allowOpenTasks = hasFlag(args, "--allow-open-tasks");
const now = new Date().toISOString();

const requiredStateFiles = [
  "state/evals/.gitkeep",
  "state/locks/.gitkeep",
  "state/memory/.gitkeep",
  "state/notes/.gitkeep",
  "state/package-reviews/.gitkeep",
  "state/policy/.gitkeep",
  "state/provenance/.gitkeep",
  "state/reviews/.gitkeep",
  "state/sessions/.gitkeep",
  "state/setup/.gitkeep",
  "state/status/.gitkeep",
  "state/tasks/.gitkeep",
  "state/tmp/.gitkeep",
  "state/tool-proposals/.gitkeep",
  "state/traces/.gitkeep",
];

const steps = [];
const warnings = [];
const findings = [];
const created = [];

step("node", "Node.js runtime", () => {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new Error(`Node 22+ required, found ${process.versions.node}`);
  return `v${process.versions.node}`;
});

step("npm", "npm CLI", () => commandVersion("npm", ["--version"]));
step("package-manager", "package manager", () => {
  const selection = selectPackageManager();
  if (!selection.available) throw new Error("no supported package manager found");
  if (selection.fallback) warnings.push("pnpm is preferred but unavailable here; falling back to npm.");
  return `${selection.name} (${selection.reason})`;
});
step("package-lock", "package lock", () => {
  if (existsSync(pathFromRoot("pnpm-lock.yaml"))) return "pnpm-lock.yaml present";
  return exists("package-lock.json", "package-lock.json present");
});
step("package-json", "package scripts", () => {
  const pkg = JSON.parse(readFileSync(pathFromRoot("package.json"), "utf8"));
  for (const script of ["harness:bootstrap", "harness:setup", "harness:ready", "gates", "package:harness"]) {
    if (!pkg.scripts?.[script]) throw new Error(`missing npm script: ${script}`);
  }
  return "required scripts present";
});

step("state-dirs", "local state directories", () => {
  for (const rel of requiredStateFiles) ensurePlaceholder(rel);
  return created.length ? `created ${created.length} placeholder(s)` : "ready";
});

step("pi-cli", "Pi CLI", () => {
  const local = join(pathFromRoot("node_modules", ".bin", "pi"));
  if (existsSync(local)) return commandVersion(local, ["--version"]);
  const global = spawnSync("pi", ["--version"], { cwd: pathFromRoot(), encoding: "utf8", timeout: 10_000 });
  if (global.status === 0) {
    warnings.push("Repo-local Pi CLI was not found; using global Pi fallback. Pin or vendor a reviewed Pi CLI for full single-repo portability.");
    return `${String(global.stdout || global.stderr).trim() || "available"} (global)`;
  }
  warnings.push("Pi CLI was not found locally or globally; install or vendor it before live Pi sessions.");
  return "not found; live sessions unavailable until installed";
}, { soft: true });

step("node-modules", "node dependencies", () => {
  const selection = selectPackageManager();
  const commandText = installCommandText(selection);
  if (existsSync(pathFromRoot("node_modules"))) return "node_modules present";
  if (!install) {
    warnings.push("node_modules is missing; run `" + commandText + "` or `npm run harness:bootstrap -- --install` when installs are approved.");
    return "not installed";
  }
  const result = run(selection.command, selection.installArgs, { timeout: 10 * 60_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${commandText} exited ${result.status}`);
  return commandText + " completed";
}, { soft: !install });

step("offline-vendor", "offline vendor manifest", () => {
  if (!offline) return "not requested";
  if (!existsSync(pathFromRoot("vendor", "manifest.json"))) throw new Error("--offline requires vendor/manifest.json with reviewed local package artifacts");
  return "vendor/manifest.json present";
}, { soft: !offline });

step("package-manifest", "package manifest", () => runJsonOk(["scripts/package-harness.mjs", "doctor", "--json"]));
step("package-approval", "package approvals", () => runJsonOk(["scripts/package-approval.mjs", "doctor", "--json"]));
step("tool-metadata", "connector metadata", () => runJsonOk(["scripts/tool-policy.mjs", "metadata", "--json"]));
step("package-provenance", "package provenance", () => runJsonOk(["scripts/package-provenance.mjs", "check", "--json"]), { soft: true });
step("harness-check", "harness quick check", () => runJsonOk(["scripts/harnessctl.mjs", "check", "--json"]));

if (runGates) {
  const readinessArgs = ["scripts/harnessctl.mjs", "ready", "--run-gates", "--json"];
  if (allowOpenTasks) readinessArgs.push("--allow-open-tasks");
  step("readiness-gates", "readiness gates", () => runJsonOk(readinessArgs, { timeout: 10 * 60_000 }));
}

const nextSteps = computeNextSteps();
const ok = findings.length === 0;
const result = { ok, generatedAt: now, mode: { install, offline, runGates, allowOpenTasks }, created, warnings, findings, steps, nextSteps };

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}
process.exit(ok ? 0 : 1);

function step(id, label, fn, options = {}) {
  const startedAt = new Date().toISOString();
  try {
    const detail = fn();
    steps.push({ id, label, ok: true, detail, soft: Boolean(options.soft), startedAt, finishedAt: new Date().toISOString() });
  } catch (error) {
    const message = String(error.message || error);
    steps.push({ id, label, ok: false, detail: message, soft: Boolean(options.soft), startedAt, finishedAt: new Date().toISOString() });
    if (options.soft) warnings.push(`${label}: ${message}`);
    else findings.push(`${label}: ${message}`);
  }
}

function exists(rel, detail) {
  if (!existsSync(pathFromRoot(rel))) throw new Error(`missing ${rel}`);
  return detail;
}

function ensurePlaceholder(rel) {
  const abs = pathFromRoot(rel);
  mkdirSync(dirname(abs), { recursive: true });
  if (!existsSync(abs)) {
    writeFileSync(abs, "", "utf8");
    created.push(rel);
  }
}

function commandVersion(command, versionArgs) {
  const result = run(command, versionArgs, { timeout: 10_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} exited ${result.status}`);
  return String(result.stdout || result.stderr).trim() || "available";
}

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: pathFromRoot(),
    encoding: "utf8",
    timeout: options.timeout || 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function runJsonOk(commandArgs, options = {}) {
  const result = run(process.execPath, commandArgs, options);
  if (result.status !== 0) throw new Error(trimResult(result));
  const parsed = JSON.parse(result.stdout || "{}");
  if (parsed.ok === false) throw new Error((parsed.findings || []).join("; ") || "reported ok=false");
  return summarize(parsed);
}

function trimResult(result) {
  return String(result.stderr || result.stdout || `exit ${result.status}`).trim().slice(0, 1000);
}

function summarize(parsed) {
  if (typeof parsed.caseCount === "number") return `${parsed.caseCount} eval case(s)`;
  if (typeof parsed.count === "number") return `${parsed.count} item(s)`;
  if (parsed.summary?.total !== undefined) return `${parsed.summary.total} metadata entr${parsed.summary.total === 1 ? "y" : "ies"}`;
  if (Array.isArray(parsed.checks)) return `${parsed.checks.length} check(s)`;
  if (Array.isArray(parsed.include)) return `${parsed.include.length} package path(s)`;
  if (Array.isArray(parsed.packages)) return `${parsed.packages.length} package(s)`;
  return "ok";
}

function computeNextSteps() {
  const steps = [];
  if (!existsSync(pathFromRoot("node_modules"))) steps.push("Install dependencies when approved: `" + installCommandText(selectPackageManager()) + "` or `npm run harness:bootstrap -- --install`.");
  if (warnings.some((warning) => warning.includes("Repo-local Pi CLI"))) steps.push("For full portability, add a reviewed repo-local Pi CLI or vendor artifact.");
  else if (warnings.some((warning) => warning.includes("Pi CLI"))) steps.push("Install or vendor the Pi CLI before live sessions.");
  if (!runGates) steps.push("Run full readiness before rollout: `npm run harness:ready -- --run-gates`.");
  steps.push("For guided setup, run: `npm run harness:setup -- --apply`.");
  steps.push("Model, team, and research batteries are explained inside the setup wizard.");
  steps.push("Start the isolated agent: `npm run pi`.");
  steps.push("For an existing project, run the public adoption flow from that project root: `pi-harness-adopt`.");
  return steps;
}

function printHuman(result) {
  console.log("Pi Harness Bootstrap");
  console.log("====================");
  console.log(`Mode: ${install ? "install" : "inspect"}${offline ? " + offline" : ""}${runGates ? " + gates" : ""}`);
  console.log("");
  for (const item of result.steps) {
    const icon = item.ok ? "✓" : item.soft ? "!" : "✗";
    console.log(`${icon} ${item.label}: ${item.detail}`);
  }
  if (result.created.length) {
    console.log("");
    console.log("Created local placeholders:");
    for (const rel of result.created) console.log(`- ${rel}`);
  }
  if (result.warnings.length) {
    console.log("");
    console.log("Warnings:");
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }
  if (result.findings.length) {
    console.log("");
    console.log("Blockers:");
    for (const finding of result.findings) console.log(`- ${finding}`);
  }
  console.log("");
  console.log("Next steps:");
  for (const next of result.nextSteps) console.log(`- ${next}`);
  console.log("");
  console.log(result.ok ? "Bootstrap ready." : "Bootstrap needs attention.");
}
