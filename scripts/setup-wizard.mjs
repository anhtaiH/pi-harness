import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { commandWithArgs, harnessCommand, hasFlag, nowIso, parseFlag, pathFromRoot, shellQuote, timestampId } from "./lib/harness-state.mjs";
import { installCommandText, selectPackageManager } from "./lib/package-manager.mjs";

const rawArgs = process.argv.slice(2);
const setupWarnings = [];
const answers = await collectSetupAnswers(rawArgs, setupWarnings);
const args = rawArgs;
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply") || answers.apply === true;
const install = hasFlag(args, "--install") || answers.install === true;
const runGates = hasFlag(args, "--run-gates") || answers.runGates === true;
const allowOpenTasks = hasFlag(args, "--allow-open-tasks") || answers.allowOpenTasks === true;
const allowWriterLock = hasFlag(args, "--allow-writer-lock") || answers.allowWriterLock === true;
const noAlias = hasFlag(args, "--no-alias") || answers.alias === false || answers.alias === "";
const noProjectChecks = hasFlag(args, "--no-project-checks") || answers.projectChecks === false;
const aliasName = String(answers.alias && answers.alias !== true ? answers.alias : parseFlag(args, "--alias", "ph"));
const checksProfile = String(answers.checksProfile || parseFlag(args, "--checks-profile", "standard"));
const setupDir = pathFromRoot("state", "setup");
const promptPath = pathFromRoot("state", "setup", "agent-prompt.md");
const latestPath = pathFromRoot("state", "setup", "latest.json");
const runPath = pathFromRoot("state", "setup", "run-" + timestampId() + ".json");
const aliasPath = pathFromRoot("state", "setup", `${aliasName}-alias.sh`);
const aliasJsonPath = pathFromRoot("state", "setup", "command-alias.json");
const cheatsheetPath = pathFromRoot("state", "setup", "cheatsheet.md");
const projectChecksPath = pathFromRoot("state", "setup", "project-checks.json");
const projectAdapterPath = pathFromRoot("state", "setup", "project-adapter.harness.json");

const actions = [];
const warnings = [...setupWarnings];
const findings = [];
if (answers.parseError) findings.push(`invalid setup answers JSON: ${answers.parseError}`);

inspectRepo();
installDeps();
bootstrapState();
projectCheckGuidance();
verifyHarness();
capabilityGuidance();
reviewPolicyGuidance();
aliasGuidance();
cheatsheet();
agentHandoff();

const result = {
  ok: findings.length === 0,
  generatedAt: nowIso(),
  mode: { apply, install, runGates, allowOpenTasks, allowWriterLock, interactive: hasFlag(args, "--interactive"), checksProfile, alias: noAlias ? "disabled" : aliasName },
  summary: apply ? "setup applied" : "setup plan only",
  actions,
  warnings,
  findings,
  artifacts: {
    prompt: apply ? rel(promptPath) : "planned: state/setup/agent-prompt.md",
    latest: apply ? rel(latestPath) : "planned: state/setup/latest.json",
    run: apply ? rel(runPath) : "planned: state/setup/run-<timestamp>.json",
    alias: apply && !noAlias ? rel(aliasPath) : "planned: state/setup/<alias>-alias.sh",
    cheatsheet: apply ? rel(cheatsheetPath) : "planned: state/setup/cheatsheet.md",
    projectChecks: apply && !noProjectChecks ? rel(projectChecksPath) : "planned: state/setup/project-checks.json",
    projectAdapter: apply && !noProjectChecks ? rel(projectAdapterPath) : "planned: state/setup/project-adapter.harness.json",
  },
  next: nextSteps(),
};

if (apply) saveResult(result);
if (json) console.log(JSON.stringify(result, null, 2));
else printHuman(result);
process.exit(result.ok ? 0 : 1);

async function collectSetupAnswers(argv, setupWarnings) {
  const provided = loadProvidedAnswers(argv);
  if (!hasFlag(argv, "--interactive")) return provided;
  if (!processStdin.isTTY || !processStdout.isTTY) {
    setupWarnings.push("--interactive requested but stdin/stdout are not TTY; using flags/answers only.");
    return provided;
  }
  const rl = createInterface({ input: processStdin, output: processStdout });
  try {
    const next = { ...provided };
    next.apply = await askYesNo(rl, "Apply safe local setup now?", Boolean(next.apply || hasFlag(argv, "--apply")));
    next.install = await askYesNo(rl, "Install harness dependencies now if missing?", Boolean(next.install || hasFlag(argv, "--install")));
    next.projectChecks = await askYesNo(rl, "Detect and save project checks?", next.projectChecks !== false && !hasFlag(argv, "--no-project-checks"));
    if (next.projectChecks !== false) next.checksProfile = await askChoice(rl, "Default check profile", ["quick", "standard", "full"], String(next.checksProfile || parseFlag(argv, "--checks-profile", "standard")));
    const wantsAlias = await askYesNo(rl, "Write a local alias snippet?", next.alias !== false && !hasFlag(argv, "--no-alias"));
    next.alias = wantsAlias ? await askText(rl, "Alias name", String(next.alias && next.alias !== true ? next.alias : parseFlag(argv, "--alias", "ph"))) : false;
    next.runGates = await askYesNo(rl, "Run full gates now?", Boolean(next.runGates || hasFlag(argv, "--run-gates")));
    return next;
  } finally {
    rl.close();
  }
}

function loadProvidedAnswers(argv) {
  const inline = parseFlag(argv, "--answers-json", "");
  const file = parseFlag(argv, "--answers-file", "");
  const text = inline ? inline : file ? readFileSync(file, "utf8") : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    return { parseError: String(error.message || error) };
  }
}

async function askYesNo(rl, question, defaultValue) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${question} [${suffix}] `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes", "true", "1"].includes(answer);
}

async function askChoice(rl, question, choices, defaultValue) {
  const answer = (await rl.question(`${question} (${choices.join("/")}) [${defaultValue}] `)).trim().toLowerCase();
  return choices.includes(answer) ? answer : defaultValue;
}

async function askText(rl, question, defaultValue) {
  const answer = (await rl.question(`${question} [${defaultValue}] `)).trim();
  return answer || defaultValue;
}

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
    actions.push({ id: "bootstrap-local-state", title: "Bootstrap local state", status: "planned", applied: false, command: "node scripts/bootstrap.mjs --json", why: "Create local placeholders and validate harness behavior." });
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

function projectCheckGuidance() {
  if (noProjectChecks) {
    actions.push({ id: "project-checks", title: "Detect project checks", status: "skipped", applied: false, why: "Skipped by --no-project-checks." });
    return;
  }
  const command = [process.execPath, "scripts/project-checks.mjs", "detect", "--profile", checksProfile, "--json"];
  if (apply) command.splice(3, 0, "--apply");
  const result = run(command[0], command.slice(1), 120_000);
  const parsed = parseJson(result.stdout);
  const ok = result.status === 0 && parsed?.ok !== false;
  const reason = ok ? "pass" : parsed?.findings?.join("; ") || result.stderr.trim() || result.stdout.trim().slice(0, 500) || "exit " + result.status;
  actions.push({
    id: "project-checks",
    title: "Detect project checks",
    status: ok ? "ok" : "failed",
    applied: apply,
    command: display(command),
    why: "Let the harness discover lint/typecheck/test/build commands instead of making each project hand-write adapters from scratch.",
    result: { status: result.status, ok, reason, summary: parsed?.summary || {} },
    checks: (parsed?.checks || []).map((item) => ({ id: item.id, command: item.command, tier: item.tier, enabled: item.enabled })),
    artifacts: apply ? [rel(projectChecksPath), rel(projectAdapterPath)] : [],
  });
  if (parsed?.warnings?.length) warnings.push(...parsed.warnings.map((warning) => "project checks: " + warning));
  if (!ok) findings.push("project-checks: " + reason);
}

function reviewPolicyGuidance() {
  const result = run(process.execPath, ["scripts/review-policy.mjs", "explain", "--json"], 120_000);
  const parsed = parseJson(result.stdout);
  const ok = result.status === 0 && parsed?.ok !== false;
  const reason = ok ? "pass" : parsed?.findings?.join("; ") || result.stderr.trim() || result.stdout.trim().slice(0, 500) || "exit " + result.status;
  actions.push({
    id: "review-policy",
    title: "Explain risk-based review policy",
    status: ok ? "ok" : "failed",
    applied: false,
    command: "node scripts/review-policy.mjs explain --json",
    why: "Make fresh-context review a visible risk decision instead of a manual afterthought.",
    result: { status: result.status, ok, reason, policy: parsed?.policy || {} },
  });
  if (!ok) findings.push("review-policy: " + reason);
}

function aliasGuidance() {
  if (noAlias) {
    actions.push({ id: "command-alias", title: "Choose day-to-day command alias", status: "skipped", applied: false, why: "Skipped by --no-alias." });
    return;
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(aliasName)) {
    findings.push("--alias must start with a letter and contain only letters, numbers, dash, or underscore");
    actions.push({ id: "command-alias", title: "Choose day-to-day command alias", status: "failed", applied: false, why: "Aliases should be shell-safe and easy to type.", alias: aliasName });
    return;
  }
  const launcher = pathFromRoot("bin", "pi-harness");
  const snippet = [
    "# Pi harness day-to-day alias",
    "# Reference only: the curl installer tries to install `ph` for you.",
    `alias ${aliasName}=${shellQuote(launcher)}`,
    "",
  ].join("\n");
  if (apply) {
    mkdirSync(dirname(aliasPath), { recursive: true });
    writeFileSync(aliasPath, snippet, "utf8");
    writeFileSync(aliasJsonPath, JSON.stringify({ alias: aliasName, launcher, snippet: rel(aliasPath), updatedAt: nowIso() }, null, 2) + "\n", "utf8");
  }
  actions.push({
    id: "command-alias",
    title: "Choose day-to-day command alias",
    status: apply ? "ok" : "planned",
    applied: apply,
    alias: aliasName,
    path: apply ? rel(aliasPath) : "state/setup/<alias>-alias.sh",
    command: `${aliasName} next`,
    why: "Local and repo mode should feel like one API: ph next, ph setup, ph, ph done. The curl installer creates a ph command when possible; this file is only a fallback reference.",
  });
}

function cheatsheet() {
  const content = cheatsheetText();
  if (apply) {
    mkdirSync(dirname(cheatsheetPath), { recursive: true });
    writeFileSync(cheatsheetPath, content, "utf8");
  }
  actions.push({
    id: "day-two-cheatsheet",
    title: "Write day-two cheatsheet",
    status: apply ? "ok" : "planned",
    applied: apply,
    path: apply ? rel(cheatsheetPath) : "state/setup/cheatsheet.md",
    why: "End setup with the exact daily loop, not a pointer to a long manual.",
    preview: content.split(/\r?\n/).slice(0, 10),
  });
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
  const setupCommand = harnessCommand("setup");
  if (!apply) steps.push("Apply safe local setup: `" + commandWithArgs(setupCommand, "--apply") + "`.");
  if (apply && !noAlias) steps.push("Use `" + aliasName + "` from your project if it is available; if not, use the launcher printed above. No internal setup paths need to be memorized.");
  if (apply && !runGates) steps.push("For full confidence: `" + commandWithArgs(setupCommand, "--apply --run-gates --allow-open-tasks") + "`.");
  if (apply) steps.push("First-time model setup: run `" + pathFromRoot("bin", "pi-harness") + " models` for the /login and /model guide before opening Pi for real work.");
  if (apply) steps.push("Start Pi with `" + harnessCommand("pi") + "`, then type `/harness` whenever you are unsure what is possible.");
  if (apply) steps.push("Need local LLMs, team/research tools, memory, or task shaping? Run `" + pathFromRoot("bin", "pi-harness") + " more` or use `/harness` inside Pi.");
  if (apply) steps.push("Optional reference artifacts were written to " + rel(cheatsheetPath) + " and " + rel(promptPath) + "; you do not need to memorize those paths.");
  steps.push("Use `" + harnessCommand("next") + "` when you are unsure what to do next.");
  return steps;
}

function promptText() {
  return [
    "You are Pi running inside this harness. Continue setup as an agent-driven, transparent wizard.",
    "",
    "Goal:",
    "- Make the harness easier to start by automating safe boilerplate and explaining each action.",
    "",
    "Rules:",
    "- Keep project changes explicit; local-sidecar mode should not write to the project unless the human asks.",
    "- Prefer small, inspectable steps over broad hidden automation.",
    "",
    "Start here:",
    "1. Call harness_status.",
    "2. Do not ask the human to remember state/setup paths; use /harness, /harness-models, /harness-local-llm, /harness-team, /harness-research, /harness-memory, and /harness-brief as the front door.",
    "3. If there is no active task and the human's request is vague, use /harness-brief style questions before implementation.",
    "4. Explain the plan as inspect, apply, verify, hand off.",
    "5. Automate safe local boilerplate instead of asking the human to copy commands.",
    "6. Show commands and artifacts so the human can watch what happened, but keep paths as reference material, not the interface.",
    "7. Use the done flow before claiming completion: run project checks, review policy, evidence doctor, and finish gates.",
    "",
    "Useful commands:",
    "- " + commandWithArgs(harnessCommand("setup"), "--apply"),
    "- " + harnessCommand("pi"),
    "- " + harnessCommand("next"),
    "- " + harnessCommand("learn"),
    "- " + pathFromRoot("bin", "pi-harness") + " more",
    "- " + pathFromRoot("bin", "pi-harness") + " models",
    "- " + pathFromRoot("bin", "pi-harness") + " local-llm",
    "- " + pathFromRoot("bin", "pi-harness") + " team",
    "- " + pathFromRoot("bin", "pi-harness") + " research",
    "- " + commandWithArgs(harnessCommand("setup"), "--apply --alias " + aliasName),
    "- " + commandWithArgs(pathFromRoot("bin", "pi-harness") + " checks", "detect --apply"),
    "- " + pathFromRoot("bin", "pi-harness") + " done",
    "",
  ].join("\n");
}

function cheatsheetText() {
  const reliable = {
    setup: harnessCommand("setup"),
    next: harnessCommand("next"),
    check: harnessCommand("check"),
    pi: harnessCommand("pi"),
    done: pathFromRoot("bin", "pi-harness") + " done",
    checks: pathFromRoot("bin", "pi-harness") + " checks",
    longRun: pathFromRoot("bin", "pi-harness") + " run-long",
  };
  const shortPrefix = noAlias ? "" : [
    "## Short Command",
    "",
    "The curl installer tries to install the short `" + aliasName + "` command for you. From your project, use `" + aliasName + "`, `" + aliasName + " next`, `" + aliasName + " done`, and `" + aliasName + " checks run`.",
    "",
    "If `" + aliasName + "` is not found, use the direct launcher commands shown below. You do not need to memorize any `state/setup` paths.",
    "",
  ].join("\n");
  return [
    "# Pi Harness Day-Two Cheatsheet",
    "",
    "Use this from your project after setup. The front door inside Pi is `/harness`.",
    "",
    shortPrefix,
    "## Daily Loop",
    "",
    "```bash",
    reliable.next,
    reliable.check,
    reliable.pi,
    "```",
    "",
    "Inside Pi:",
    "",
    "```text",
    "/harness",
    "/harness-brief   # when the task is fuzzy and you want Pi to grill you into a good packet",
    "Use the harness workflow: scope, implement, run checks, review if needed, then done.",
    "```",
    "",
    "Finish from shell or inside Pi:",
    "",
    "```bash",
    reliable.done,
    "```",
    "",
    "## More Help Without Remembering Flags",
    "",
    "```bash",
    pathFromRoot("bin", "pi-harness") + " more",
    pathFromRoot("bin", "pi-harness") + " models       # plain-language /login + /model guidance",
    pathFromRoot("bin", "pi-harness") + " local-llm    # Ollama / LM Studio guidance",
    pathFromRoot("bin", "pi-harness") + " team         # opens Pi with team tools available",
    pathFromRoot("bin", "pi-harness") + " research     # opens Pi with research/MCP tools available",
    pathFromRoot("bin", "pi-harness") + " route \"research this with sources\"",
    pathFromRoot("bin", "pi-harness") + " reset        # preview safe reset/retry",
    "```",
    "",
    "Inside Pi, `/harness` is the escape hatch for all of these.",
    "",
    "## Project Checks",
    "",
    "```bash",
    reliable.checks + " list",
    reliable.checks + " run",
    "```",
    "",
    "## Longer Work",
    "",
    "```bash",
    reliable.longRun + " \"large migration goal\"",
    pathFromRoot("bin", "pi-harness") + " resume-long <id>",
    "```",
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
