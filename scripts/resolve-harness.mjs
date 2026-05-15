import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, readJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const cwd = resolve(parseFlag(args, "--cwd", process.cwd()));
const findings = [];
const candidates = [];

if (process.env.PI_HARNESS_ROOT) addCandidate("env", process.env.PI_HARNESS_ROOT, "PI_HARNESS_ROOT");
addNearestRepoSidecar(cwd);
addRegistryCandidates(cwd);
addSourceRootIfRelevant(cwd);

const selected = candidates.find((candidate) => isHarnessRoot(candidate.harnessRoot)) || null;
const result = {
  ok: Boolean(selected),
  cwd,
  selected,
  candidates,
  registryPath: registryPath(),
  findings: selected ? [] : findings,
};

if (json) printResult(result, true, "harness resolver");
if (selected) {
  process.stdout.write(selected.harnessRoot + "\n");
  process.exit(0);
}
process.exit(1);

function addNearestRepoSidecar(start) {
  let dir = start;
  while (true) {
    const sidecar = join(dir, ".pi-harness");
    if (isHarnessRoot(sidecar)) {
      addCandidate("repo-sidecar", sidecar, `nearest .pi-harness under ${dir}`);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

function addRegistryCandidates(start) {
  const registry = readJson(registryPath(), null);
  const projects = registry?.projects || {};
  const matches = Object.entries(projects)
    .map(([projectRoot, entry]) => ({ projectRoot: resolve(projectRoot), entry }))
    .filter(({ projectRoot }) => isSameOrInside(start, projectRoot))
    .sort((a, b) => b.projectRoot.length - a.projectRoot.length);
  for (const match of matches) addCandidate("registry", match.entry.harnessRoot, `registered project ${match.projectRoot}`, match.projectRoot);
}

function addSourceRootIfRelevant(start) {
  const root = pathFromRoot();
  if (isSameOrInside(start, root)) addCandidate("source-root", root, "current harness source checkout", root);
}

function addCandidate(source, harnessRoot, reason, projectRoot = "") {
  const resolved = resolve(String(harnessRoot || ""));
  if (!resolved || candidates.some((candidate) => candidate.harnessRoot === resolved)) return;
  candidates.push({ source, harnessRoot: resolved, projectRoot, reason, exists: existsSync(resolved), valid: isHarnessRoot(resolved) });
}

function isHarnessRoot(root) {
  return Boolean(root && existsSync(join(root, "bin", "pi-harness")) && existsSync(join(root, "harness.config.json")));
}

function isSameOrInside(child, parent) {
  const a = resolve(child);
  const b = resolve(parent);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
}

function registryPath() {
  return join(harnessHome(), "registry.json");
}

function harnessHome() {
  if (process.env.PI_HARNESS_HOME) return resolve(process.env.PI_HARNESS_HOME);
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "pi-harness");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || process.env.APPDATA || homedir(), "pi-harness");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "pi-harness");
}
