import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { hasFlag, nowIso, parseFlag, pathFromRoot, shellQuote, slug } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply");
const force = hasFlag(args, "--force");
const targetRoot = resolve(parseFlag(args, "--target", process.cwd()));
const sourceRoot = pathFromRoot();
const actions = [];
const warnings = [];
const findings = [];
const copied = [];
const adoptionMode = parseAdoptionMode();
const scriptsMode = parseScriptsMode();
const sidecarDir = adoptionMode === "repo"
  ? join(targetRoot, ".pi-harness")
  : resolve(parseFlag(args, "--harness-root", defaultLocalHarnessRoot(targetRoot)));
const localAgentDir = ".pi" + "-agent";

if (resolve(targetRoot) === resolve(sourceRoot)) {
  warnings.push("Target is this harness source checkout. Adoption is meant for an existing project repo; use README contributor setup here.");
}

inspectTarget();
planHarnessCopy();
planPackageJson();
planGitignore();

const result = {
  ok: findings.length === 0,
  generatedAt: nowIso(),
  mode: { apply, force, adoptionMode, scriptsMode, targetRoot, sidecarDir, projectWrites: projectWrites() },
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

function parseAdoptionMode() {
  const requested = parseFlag(args, "--mode", hasFlag(args, "--repo") ? "repo" : hasFlag(args, "--local") ? "local" : "local");
  if (!["local", "repo"].includes(requested)) findings.push("--mode must be local or repo");
  return ["local", "repo"].includes(requested) ? requested : "local";
}

function parseScriptsMode() {
  const requested = parseFlag(args, "--scripts", adoptionMode === "repo" ? "package-json" : "none");
  if (!["none", "package-json"].includes(requested)) findings.push("--scripts must be none or package-json");
  return ["none", "package-json"].includes(requested) ? requested : "none";
}

function inspectTarget() {
  const details = {
    targetExists: existsSync(targetRoot),
    packageJson: existsSync(join(targetRoot, "package.json")),
    git: existsSync(join(targetRoot, ".git")),
    adoptionMode,
    scriptsMode,
    sidecarExists: existsSync(sidecarDir),
    sidecarDir,
  };
  if (!details.targetExists) findings.push("target does not exist: " + targetRoot);
  if (scriptsMode === "package-json" && !details.packageJson) findings.push("target package.json is required when --scripts package-json is selected");
  actions.push({ id: "inspect-target", title: "Inspect existing project", status: findings.length ? "failed" : "ok", applied: false, details });
}

function planHarnessCopy() {
  const entries = [
    ".github",
    ".gitignore",
    ".pi",
    "AGENTS.md",
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
    "pnpm-lock.yaml",
    "package-approvals.json",
    "package-provenance.lock.json",
    "tsconfig.json",
    "README.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
  ];
  actions.push({
    id: "copy-harness",
    title: adoptionMode === "local" ? "Copy local harness" : "Copy repo sidecar",
    status: apply ? "ok" : "planned",
    applied: apply,
    path: displayPath(sidecarDir),
    why: adoptionMode === "local"
      ? "Keep Pi/harness code and installs outside the project checkout so there is nothing to accidentally commit."
      : "Keep harness code/state under .pi-harness so teams can version the harness with the project when they choose.",
    entries,
  });
  if (!apply || findings.length) return;
  mkdirSync(sidecarDir, { recursive: true });
  for (const entry of entries) copyEntry(join(sourceRoot, entry), join(sidecarDir, entry));
  if (adoptionMode === "local") writeProjectMetadata();
  createStateDirs(sidecarDir);
}

function planPackageJson() {
  if (scriptsMode === "none") {
    actions.push({
      id: "package-scripts",
      title: "Leave project package.json unchanged",
      status: "skipped",
      applied: false,
      why: "Local adoption should not require repo changes. Use the printed harness launcher commands instead.",
    });
    return;
  }
  const packagePath = join(targetRoot, "package.json");
  if (!existsSync(packagePath)) return;
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const scripts = pkg.scripts || {};
  const additions = packageScripts();
  const conflicts = Object.entries(additions).filter(([name, value]) => scripts[name] && scripts[name] !== value).map(([name]) => name);
  if (conflicts.length && !force) warnings.push("package.json already has script(s) not overwritten without --force: " + conflicts.join(", "));
  const writable = Object.entries(additions).filter(([name]) => force || !scripts[name] || scripts[name] === additions[name]);
  actions.push({ id: "merge-package-scripts", title: "Add minimal npm scripts", status: apply ? "ok" : "planned", applied: apply, scripts: additions, conflicts, why: "Expose the npm-run golden path when the project owner wants harness entry points in package.json." });
  if (!apply || findings.length) return;
  pkg.scripts = { ...scripts };
  for (const [name, value] of writable) pkg.scripts[name] = value;
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

function packageScripts() {
  if (adoptionMode === "repo") {
    return {
      "harness:setup": "node .pi-harness/scripts/setup-wizard.mjs",
      "harness:next": "node .pi-harness/scripts/harnessctl.mjs next",
      "harness:learn": "node .pi-harness/scripts/harnessctl.mjs learn",
      "harness:check": "node .pi-harness/scripts/harnessctl.mjs check",
      "harness:ready": "node .pi-harness/scripts/harnessctl.mjs ready",
      pi: "./.pi-harness/bin/pi-harness",
      "pi:print": "./.pi-harness/bin/pi-harness -p",
    };
  }
  const launcher = shellQuote(join(sidecarDir, "bin", "pi-harness"));
  return {
    "harness:setup": `${launcher} setup`,
    "harness:next": `${launcher} next`,
    "harness:learn": `${launcher} learn`,
    "harness:check": `${launcher} check`,
    "harness:ready": `${launcher} ready`,
    pi: launcher,
    "pi:print": `${launcher} -p`,
  };
}

function planGitignore() {
  if (adoptionMode === "local") {
    actions.push({ id: "update-gitignore", title: "Leave project .gitignore unchanged", status: "skipped", applied: false, why: "The harness lives outside the project checkout, so there is no harness runtime state to ignore here." });
    return;
  }
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
  actions.push({ id: "update-gitignore", title: "Protect local harness state", status: needed ? apply ? "ok" : "planned" : "skipped", applied: apply && needed, path: displayPath(gitignorePath), why: "Runtime sessions, package caches, and local auth must not be committed." });
  if (!apply || !needed || findings.length) return;
  writeFileSync(gitignorePath, existing.replace(/\s*$/, "") + block, "utf8");
}

function writeProjectMetadata() {
  const metadataPath = join(sidecarDir, "harness.project.json");
  const existing = readJsonIfExists(metadataPath) || {};
  const metadata = {
    schemaVersion: 1,
    adoptionMode: "local",
    projectRoot: targetRoot,
    harnessRoot: sidecarDir,
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
  copied.push(displayPath(metadataPath));
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
    copied.push(displayPath(dst));
  }
}

function skipName(name) {
  return name === ".git" || name === "node_modules" || name === localAgentDir || name === ".DS_Store" || name === "harness.project.json";
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
  const applyCommand = adoptionApplyCommand();
  const launcher = shellQuote(join(sidecarDir, "bin", "pi-harness"));
  if (!apply) steps.push("Apply adoption after reviewing the plan: `" + applyCommand + "`.");
  if (adoptionMode === "local") {
    steps.push("Install/check the local harness: `" + launcher + " setup --apply --install`.");
    steps.push("Start Pi in this project: `" + launcher + "`.");
    steps.push("When you intentionally need team/research batteries: `PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 " + launcher + "`.");
    if (scriptsMode === "none") steps.push("Optional: rerun with `--scripts package-json` if you want npm scripts that point at this local harness.");
  } else {
    steps.push("Install/check the repo sidecar: `npm run harness:setup -- --apply --install`.");
    steps.push("Start Pi from your project: `npm run pi`.");
    steps.push("When you intentionally need team/research batteries: `PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 npm run pi`.");
  }
  return steps;
}

function adoptionApplyCommand() {
  const parts = ["pi-harness-adopt"];
  const requestedTarget = parseFlag(args, "--target", null);
  if (requestedTarget) parts.push("--target", shellQuote(requestedTarget));
  if (adoptionMode === "repo") parts.push("--mode", "repo");
  const requestedHarnessRoot = parseFlag(args, "--harness-root", null);
  if (requestedHarnessRoot) parts.push("--harness-root", shellQuote(requestedHarnessRoot));
  if (scriptsMode !== (adoptionMode === "repo" ? "package-json" : "none")) parts.push("--scripts", scriptsMode);
  if (force) parts.push("--force");
  parts.push("--apply");
  return parts.join(" ");
}

function projectWrites() {
  return adoptionMode === "repo" || scriptsMode !== "none";
}

function defaultLocalHarnessRoot(projectRoot) {
  return join(harnessHome(), "projects", projectId(projectRoot));
}

function harnessHome() {
  if (process.env.PI_HARNESS_HOME) return resolve(process.env.PI_HARNESS_HOME);
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "pi-harness");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || process.env.APPDATA || homedir(), "pi-harness");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "pi-harness");
}

function projectId(projectRoot) {
  const name = slug(basename(projectRoot) || "project");
  const hash = createHash("sha256").update(resolve(projectRoot)).digest("hex").slice(0, 10);
  return `${name}-${hash}`;
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function printHuman(result) {
  console.log("Pi Harness Project Adoption");
  console.log("===========================");
  console.log("Mode: " + (apply ? "apply" : "plan") + " / " + adoptionMode + " harness");
  console.log("Project: " + targetRoot);
  console.log("Harness: " + sidecarDir);
  if (!projectWrites()) console.log("Project writes: none");
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

function displayPath(path) {
  if (adoptionMode === "local") return path;
  const value = relative(targetRoot, path);
  return value || ".";
}
