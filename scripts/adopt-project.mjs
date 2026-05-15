import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { hasFlag, nowIso, parseFlag, pathFromRoot } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply");
const force = hasFlag(args, "--force");
const targetRoot = resolve(parseFlag(args, "--target", process.cwd()));
const sourceRoot = pathFromRoot();
const sidecarDir = join(targetRoot, ".pi-harness");
const localAgentDir = ".pi" + "-agent";
const actions = [];
const warnings = [];
const findings = [];
const copied = [];

if (resolve(targetRoot) === resolve(sourceRoot)) {
  warnings.push("Target is this harness source checkout. Adoption is meant for an existing project repo; use README contributor setup here.");
}

inspectTarget();
planSidecarCopy();
planPackageJson();
planGitignore();

const result = {
  ok: findings.length === 0,
  generatedAt: nowIso(),
  mode: { apply, force, targetRoot, sidecarDir },
  summary: apply ? "adoption applied" : "adoption plan only",
  actions,
  copied,
  warnings,
  findings,
  next: nextSteps(),
};

if (json) console.log(JSON.stringify(result, null, 2));
else printHuman(result);
process.exit(result.ok ? 0 : 1);

function inspectTarget() {
  const details = {
    targetExists: existsSync(targetRoot),
    packageJson: existsSync(join(targetRoot, "package.json")),
    git: existsSync(join(targetRoot, ".git")),
    sidecarExists: existsSync(sidecarDir),
  };
  if (!details.targetExists) findings.push("target does not exist: " + targetRoot);
  if (!details.packageJson) findings.push("target package.json is required so adoption can add npm scripts without guessing project tooling");
  actions.push({ id: "inspect-target", title: "Inspect existing project", status: findings.length ? "failed" : "ok", applied: false, details });
}

function planSidecarCopy() {
  const entries = [
    ".pi",
    "bin",
    "scripts",
    "evals",
    "package-reviews",
    "vendor",
    "docs",
    "adapters",
    "harness.config.json",
    "package.json",
    "package-lock.json",
    "package-approvals.json",
    "package-provenance.lock.json",
    "tsconfig.json",
    "README.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
  ];
  actions.push({
    id: "copy-sidecar",
    title: "Copy harness sidecar",
    status: apply ? "ok" : "planned",
    applied: apply,
    path: rel(sidecarDir),
    why: "Keep harness code/state under .pi-harness so the user's project root stays recognizable.",
    entries,
  });
  if (!apply || findings.length) return;
  mkdirSync(sidecarDir, { recursive: true });
  for (const entry of entries) copyEntry(join(sourceRoot, entry), join(sidecarDir, entry));
  createStateDirs(sidecarDir);
}

function planPackageJson() {
  const packagePath = join(targetRoot, "package.json");
  if (!existsSync(packagePath)) return;
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const scripts = pkg.scripts || {};
  const additions = {
    "harness:setup": "node .pi-harness/scripts/setup-wizard.mjs",
    "harness:next": "node .pi-harness/scripts/harnessctl.mjs next",
    "harness:learn": "node .pi-harness/scripts/harnessctl.mjs learn",
    "harness:check": "node .pi-harness/scripts/harnessctl.mjs check",
    "harness:ready": "node .pi-harness/scripts/harnessctl.mjs ready",
    "pi": "./.pi-harness/bin/pi-harness",
    "pi:print": "./.pi-harness/bin/pi-harness -p",
  };
  const conflicts = Object.entries(additions).filter(([name, value]) => scripts[name] && scripts[name] !== value).map(([name]) => name);
  if (conflicts.length && !force) warnings.push("package.json already has script(s) not overwritten without --force: " + conflicts.join(", "));
  const writable = Object.entries(additions).filter(([name]) => force || !scripts[name] || scripts[name] === additions[name]);
  actions.push({ id: "merge-package-scripts", title: "Add minimal npm scripts", status: apply ? "ok" : "planned", applied: apply, scripts: additions, conflicts, why: "Expose one golden path from the user's existing repo: npm run harness:setup, then npm run pi." });
  if (!apply || findings.length) return;
  pkg.scripts = { ...scripts };
  for (const [name, value] of writable) pkg.scripts[name] = value;
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

function planGitignore() {
  const gitignorePath = join(targetRoot, ".gitignore");
  const block = [
    "",
    "# Pi harness local runtime state",
    ".pi-harness/" + localAgentDir + "/*",
    ".pi-harness/.pi/npm/",
    ".pi-harness/node_modules/",
    ".pi-harness/state/*",
    "!.pi-harness/state/**/.gitkeep",
    "",
  ].join("\n");
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const needed = !existing.includes("# Pi harness local runtime state");
  actions.push({ id: "update-gitignore", title: "Protect local harness state", status: needed ? apply ? "ok" : "planned" : "skipped", applied: apply && needed, path: rel(gitignorePath), why: "Runtime sessions, package caches, and local auth must not be committed." });
  if (!apply || !needed || findings.length) return;
  writeFileSync(gitignorePath, existing.replace(/\s*$/, "") + block, "utf8");
}

function copyEntry(src, dst) {
  if (!existsSync(src)) return;
  const stat = statSync(src);
  if (stat.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const name of readdirSync(src)) {
      if (skipName(name)) continue;
      copyEntry(join(src, name), join(dst, name));
    }
    return;
  }
  if (stat.isFile()) {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    copied.push(rel(dst));
  }
}

function skipName(name) {
  return name === ".git" || name === "node_modules" || name === localAgentDir || name === ".DS_Store";
}

function createStateDirs(root) {
  for (const dir of ["evals", "locks", "memory", "notes", "package-reviews", "policy", "provenance", "reviews", "sessions", "setup", "status", "tasks", "tmp", "tool-proposals", "traces"]) {
    const target = join(root, "state", dir);
    mkdirSync(target, { recursive: true });
    const keep = join(target, ".gitkeep");
    if (!existsSync(keep)) writeFileSync(keep, "", "utf8");
  }
}

function nextSteps() {
  if (findings.length) return ["Fix blockers above, then rerun the adoption command."];
  const steps = [];
  if (!apply) steps.push("Apply adoption after reviewing the plan: `pi-harness-adopt --apply`.");
  steps.push("Install/check the sidecar harness: `npm run harness:setup -- --apply --install`.");
  steps.push("Start Pi from your project: `npm run pi`.");
  steps.push("When you intentionally need team/research batteries: `PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 npm run pi`.");
  return steps;
}

function printHuman(result) {
  console.log("Pi Harness Project Adoption");
  console.log("===========================");
  console.log("Mode: " + (apply ? "apply" : "plan") + " in " + targetRoot);
  console.log("");
  for (const action of result.actions) {
    const icon = action.status === "ok" ? "✓" : action.status === "failed" ? "✗" : action.status === "skipped" ? "-" : "•";
    console.log(icon + " " + action.title);
    if (action.why) console.log("  Why: " + action.why);
    if (action.path) console.log("  Path: " + action.path);
    if (action.conflicts?.length) console.log("  Conflicts: " + action.conflicts.join(", "));
  }
  if (result.warnings.length) { console.log("\nWarnings:"); for (const warning of result.warnings) console.log("- " + warning); }
  if (result.findings.length) { console.log("\nBlockers:"); for (const finding of result.findings) console.log("- " + finding); }
  console.log("\nNext:");
  for (const step of result.next) console.log("- " + step);
}

function rel(path) {
  const value = relative(targetRoot, path);
  return value || ".";
}
