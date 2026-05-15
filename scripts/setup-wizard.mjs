import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { hasFlag, nowIso, pathFromRoot, timestampId } from "./lib/harness-state.mjs";
import { installCommandText, selectPackageManager } from "./lib/package-manager.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply");
const install = hasFlag(args, "--install");
const runGates = hasFlag(args, "--run-gates");
const allowOpenTasks = hasFlag(args, "--allow-open-tasks");
const allowWriterLock = hasFlag(args, "--allow-writer-lock");
const setupDir = pathFromRoot("state", "setup");
const promptPath = pathFromRoot("state", "setup", "agent-prompt.md");
const latestPath = pathFromRoot("state", "setup", "latest.json");
const runPath = pathFromRoot("state", "setup", "run-" + timestampId() + ".json");

const actions = [];
const warnings = [];
const findings = [];

inspectRepo();
installDeps();
bootstrapState();
verifyHarness();
capabilityGuidance();
agentHandoff();

const result = {
  ok: findings.length === 0,
  generatedAt: nowIso(),
  mode: { apply, install, runGates, allowOpenTasks, allowWriterLock },
  summary: apply ? "setup applied" : "setup plan only",
  actions,
  warnings,
  findings,
  artifacts: {
    prompt: apply ? rel(promptPath) : "planned: state/setup/agent-prompt.md",
    latest: apply ? rel(latestPath) : "planned: state/setup/latest.json",
    run: apply ? rel(runPath) : "planned: state/setup/run-<timestamp>.json",
  },
  next: nextSteps(),
};

if (apply) saveResult(result);
if (json) console.log(JSON.stringify(result, null, 2));
else printHuman(result);
process.exit(result.ok ? 0 : 1);

function inspectRepo() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const details = {
    node: process.versions.node,
    packageJson: existsSync(pathFromRoot("package.json")),
    packageLock: existsSync(pathFromRoot("package-lock.json")),
    pnpmLock: existsSync(pathFromRoot("pnpm-lock.yaml")),
    packageManager: selectPackageManager(),
    nodeModules: existsSync(pathFromRoot("node_modules")),
    localPi: existsSync(pathFromRoot("node_modules", ".bin", "pi")),
  };
  const localFindings = [];
  if (nodeMajor < 22) localFindings.push("Node 22+ required, found " + process.versions.node);
  if (!details.packageJson) localFindings.push("missing package.json");
  if (!details.packageLock && !details.pnpmLock) localFindings.push("missing package lockfile");
  findings.push(...localFindings);
  actions.push({
    id: "inspect-repo",
    title: "Inspect the checkout",
    status: localFindings.length ? "failed" : "ok",
    applied: false,
    why: "Start from observable facts so setup is not a manual checklist.",
    details,
    findings: localFindings,
  });
}

function installDeps() {
  const selection = selectPackageManager();
  const commandText = installCommandText(selection);
  const nodeModules = existsSync(pathFromRoot("node_modules"));
  const why = selection.name === "pnpm"
    ? "Use the faster locked pnpm path through Corepack while keeping the command visible."
    : "Use npm as the zero-prereq fallback when pnpm/Corepack is unavailable.";
  if (selection.fallback) warnings.push("pnpm is preferred but unavailable here; falling back to npm for this run.");
  if (nodeModules && !install) {
    actions.push({ id: "install-dependencies", title: "Install dependencies", status: "skipped", applied: false, command: commandText, packageManager: selection, why: "Dependencies are already present." });
    return;
  }
  if (!install) {
    warnings.push("Dependencies are missing; rerun with `--install` if you want the wizard to run `" + commandText + "`.");
    actions.push({ id: "install-dependencies", title: "Install dependencies", status: apply ? "blocked" : "planned", applied: false, command: commandText, packageManager: selection, why: "Install is explicit because it changes the checkout." });
    if (apply) findings.push("node_modules missing; pass --install to run " + commandText);
    return;
  }
  if (!apply) {
    actions.push({ id: "install-dependencies", title: "Install dependencies", status: "planned", applied: false, command: commandText, packageManager: selection, why });
    return;
  }
  capture({ id: "install-dependencies", title: "Install dependencies", command: commandText, why, result: run(selection.command, selection.installArgs, 10 * 60_000), packageManager: selection });
}

function bootstrapState() {
  if (!apply) {
    actions.push({ id: "bootstrap-local-state", title: "Bootstrap local state", status: "planned", applied: false, command: "node scripts/bootstrap.mjs --json", why: "Create local placeholders and validate repo-contained behavior." });
    return;
  }
  capture({ id: "bootstrap-local-state", title: "Bootstrap local state", command: "node scripts/bootstrap.mjs --json", why: "Automate boilerplate and leave a structured record.", result: run(process.execPath, ["scripts/bootstrap.mjs", "--json"], 5 * 60_000) });
}

function verifyHarness() {
  const command = [process.execPath, "scripts/harnessctl.mjs", runGates ? "ready" : "check", "--json"];
  if (runGates) command.push("--run-gates");
  if (runGates && allowOpenTasks) command.push("--allow-open-tasks");
  if (runGates && allowWriterLock) command.push("--allow-writer-lock");
  if (!apply) {
    actions.push({ id: "verify-readiness", title: runGates ? "Run full gates" : "Run fast checks", status: "planned", applied: false, command: display(command), why: "Setup should prove its state, not ask for trust." });
    return;
  }
  capture({ id: "verify-readiness", title: runGates ? "Run full gates" : "Run fast checks", command: display(command), why: "Turn setup into a checked flow.", result: run(command[0], command.slice(1), runGates ? 10 * 60_000 : 120_000) });
}

function capabilityGuidance() {
  const command = [process.execPath, "scripts/capability-wizard.mjs", "all"];
  if (apply) command.push("--apply");
  command.push("--json");
  const result = run(command[0], command.slice(1), 120_000);
  const parsed = parseJson(result.stdout);
  const ok = result.status === 0 && parsed?.ok !== false;
  const reason = ok ? "pass" : parsed?.findings?.join("; ") || result.stderr.trim() || result.stdout.trim().slice(0, 500) || "exit " + result.status;
  actions.push({
    id: "capability-guidance",
    title: "Plan optional batteries",
    status: ok ? "ok" : "failed",
    applied: apply,
    why: "Keep model, team, and research setup inside the main guided flow instead of making users memorize more commands.",
    result: { status: result.status, ok, reason, summary: summarize(parsed) },
    capabilities: summarizeCapabilities(parsed?.cards || []),
    artifacts: parsed?.artifacts || [],
  });
  if (!ok) findings.push("capability-guidance: " + reason);
}

function agentHandoff() {
  const content = promptText();
  if (!apply) {
    actions.push({ id: "agent-continuation-prompt", title: "Generate Pi handoff prompt", status: "planned", applied: false, path: "state/setup/agent-prompt.md", why: "Keep the ask-Pi-to-build-itself loop inspectable.", preview: content.split(/\r?\n/).slice(0, 8) });
    return;
  }
  mkdirSync(dirname(promptPath), { recursive: true });
  writeFileSync(promptPath, content, "utf8");
  actions.push({ id: "agent-continuation-prompt", title: "Generate Pi handoff prompt", status: "ok", applied: true, path: rel(promptPath), why: "The human can inspect the exact prompt before giving it to Pi." });
}

function saveResult(value) {
  mkdirSync(setupDir, { recursive: true });
  const saved = { ...value, artifacts: { ...value.artifacts, latest: rel(latestPath), run: rel(runPath), prompt: rel(promptPath) } };
  writeFileSync(latestPath, JSON.stringify(saved, null, 2) + "\n", "utf8");
  writeFileSync(runPath, JSON.stringify(saved, null, 2) + "\n", "utf8");
}

function capture({ id, title, command, why, result, packageManager = undefined }) {
  const parsed = parseJson(result.stdout);
  const ok = result.status === 0 && parsed?.ok !== false;
  const reason = ok ? "pass" : parsed?.findings?.join("; ") || result.stderr.trim() || result.stdout.trim().slice(0, 500) || "exit " + result.status;
  actions.push({ id, title, status: ok ? "ok" : "failed", applied: true, command, why, packageManager, result: { status: result.status, ok, reason, summary: summarize(parsed) } });
  if (!ok) findings.push(id + ": " + reason);
}

function run(command, commandArgs, timeout) {
  return spawnSync(command, commandArgs, { cwd: pathFromRoot(), encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
}

function parseJson(text) {
  try { return text && text.trim().startsWith("{") ? JSON.parse(text) : null; } catch { return null; }
}

function summarize(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  return {
    ok: parsed.ok,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.length : undefined,
    findings: Array.isArray(parsed.findings) ? parsed.findings.length : undefined,
    checks: Array.isArray(parsed.checks) ? parsed.checks.length : undefined,
    actions: Array.isArray(parsed.actions) ? parsed.actions.length : undefined,
    capabilities: Array.isArray(parsed.cards) ? parsed.cards.length : undefined,
    nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.length : undefined,
  };
}

function summarizeCapabilities(cards) {
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    status: card.status,
    why: card.why,
    doNow: card.doNow || [],
    guardrails: card.guardrails || [],
  }));
}

function nextSteps() {
  const steps = [];
  if (!apply) steps.push("Apply safe local setup: `npm run harness:setup -- --apply`.");
  if (apply && !runGates) steps.push("For full confidence: `npm run harness:setup -- --apply --run-gates --allow-open-tasks`.");
  if (apply) steps.push("Inspect the generated Pi prompt: " + rel(promptPath) + ".");
  if (apply) steps.push("Start Pi with `npm run pi` and hand it the generated prompt.");
  steps.push("Use `npm run harness:next` when you are unsure what to do next.");
  return steps;
}

function promptText() {
  return [
    "You are Pi running inside this repo-local harness. Continue setup as an agent-driven, transparent wizard.",
    "",
    "Goal:",
    "- Make the harness easier to adopt by automating safe boilerplate and explaining each action.",
    "",
    "Rules:",
    "- Keep changes repo-contained unless the human explicitly asks otherwise.",
    "- Prefer small, inspectable steps over broad hidden automation.",
    "",
    "Start here:",
    "1. Call harness_status.",
    "2. Inspect state/setup/latest.json and state/setup/agent-prompt.md if they exist.",
    "3. If there is no active task, create one for the next setup improvement.",
    "4. Explain the plan as inspect, apply, verify, hand off.",
    "5. Automate safe local boilerplate instead of asking the human to copy commands.",
    "6. Show commands and artifacts so the human can watch what happened.",
    "7. Write evidence before claiming completion.",
    "",
    "Useful commands:",
    "- npm run harness:setup -- --apply",
    "- npm run pi",
    "- npm run harness:next",
    "- npm run harness:learn",
    "",
  ].join("\n");
}

function printHuman(result) {
  console.log("Pi Harness Setup Wizard");
  console.log("=======================");
  console.log("Mode: " + (apply ? "apply" : "plan") + (install ? " + install" : "") + (runGates ? " + gates" : ""));
  console.log("");
  console.log("Principle: automate boring setup, but keep every action visible and reviewable.");
  console.log("");
  for (const action of result.actions) {
    const icon = action.status === "ok" ? "✓" : action.status === "failed" || action.status === "blocked" ? "✗" : action.status === "skipped" ? "-" : "•";
    console.log(icon + " " + action.title);
    console.log("  Why: " + action.why);
    if (action.command) console.log("  Command: " + action.command);
    if (action.path) console.log("  Artifact: " + action.path);
    if (action.result?.reason) console.log("  Result: " + action.result.reason);
    if (action.capabilities?.length) {
      console.log("  Optional batteries:");
      for (const capability of action.capabilities) {
        console.log("  - " + capability.title + ": " + capability.status);
        if (capability.doNow?.length) console.log("    Next inside flow: " + capability.doNow.join(" | "));
      }
    }
    if (action.artifacts?.length) console.log("  Artifacts: " + action.artifacts.join(", "));
  }
  if (result.warnings.length) { console.log(""); console.log("Warnings:"); for (const warning of result.warnings) console.log("- " + warning); }
  if (result.findings.length) { console.log(""); console.log("Blockers:"); for (const finding of result.findings) console.log("- " + finding); }
  console.log("");
  console.log("Next:");
  for (const step of result.next) console.log("- " + step);
  console.log("");
  console.log(result.ok ? "Wizard complete." : "Wizard needs attention.");
}

function display(command) {
  return command.map((part) => part === process.execPath ? "node" : part).join(" ");
}

function rel(targetPath) {
  return targetPath.replace(pathFromRoot() + "/", "");
}
