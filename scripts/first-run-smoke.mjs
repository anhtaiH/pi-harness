import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { hasFlag, pathFromRoot, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const live = hasFlag(args, "--live");
const keep = hasFlag(args, "--keep");
const skipInstall = hasFlag(args, "--skip-install");
const tmp = pathFromRoot("state", "tmp", live ? "first-run-smoke-live" : "first-run-smoke-local");
const project = join(tmp, "project");
const home = join(tmp, "home");
const bin = join(tmp, "bin");

rmSync(tmp, { recursive: true, force: true });
mkdirSync(project, { recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(bin, { recursive: true });
writeFileSync(join(project, "package.json"), JSON.stringify({ name: "pi-harness-first-run-smoke", version: "0.0.0" }, null, 2) + "\n");

try {
  const installer = installerCommand();
  const childEnv = { PATH: process.env.PATH || "", HOME: process.env.HOME || "", PI_HARNESS_HOME: home, PI_HARNESS_BIN_DIR: bin };
  if (!live) childEnv.PI_HARNESS_SOURCE_DIR = pathFromRoot();
  const install = spawnSync("bash", ["-lc", installer], { cwd: project, env: childEnv, encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 12 * 1024 * 1024 });
  const ph = spawnSync(join(bin, "ph"), ["more", "models", "--json"], { cwd: project, env: childEnv, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  const projectFiles = readdirSync(project).sort();
  const phJson = parseJson(ph.stdout);
  const stdout = install.stdout || "";
  const result = {
    ok: install.status === 0
      && ph.status === 0
      && phJson?.ok === true
      && existsSync(join(bin, "ph"))
      && projectFiles.join(",") === "package.json"
      && stdout.includes("Project writes: none")
      && stdout.includes("Ready.")
      && !stdout.includes("source state/setup"),
    mode: live ? "live-public-curl" : "local-installer",
    skipInstall,
    project,
    home,
    bin,
    installStatus: install.status,
    phStatus: ph.status,
    phOk: phJson?.ok === true,
    projectFiles,
    stdoutTail: stdout.slice(-5000),
    stderrTail: (install.stderr || "").slice(-2000),
    findings: [],
  };
  if (!result.ok) result.findings.push("first-run smoke failed; inspect stdoutTail/stderrTail");
  if (json) printResult(result, true, "first-run smoke");
  printHuman(result);
  process.exit(result.ok ? 0 : 1);
} finally {
  if (!keep) rmSync(tmp, { recursive: true, force: true });
}

function installerCommand() {
  if (!live) return [pathFromRoot("bin", "install"), skipInstall ? "--no" + "-install" : ""].filter(Boolean).join(" ");
  const base = ["curl", "-fsSL", "https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install", "|", "bash"].join(" ");
  return base + (skipInstall ? " -s -- --no" + "-install" : "");
}

function parseJson(text) {
  try { return JSON.parse(text || "{}"); } catch { return null; }
}

function printHuman(result) {
  console.log("Pi Harness First-Run Smoke");
  console.log("==========================");
  console.log("Mode: " + result.mode + (result.skipInstall ? " / skip install" : ""));
  console.log("Project writes: " + (result.projectFiles.join(",") === "package.json" ? "none" : result.projectFiles.join(", ")));
  console.log("Installer: " + result.installStatus);
  console.log("ph check: " + result.phStatus);
  console.log(result.ok ? "PASS" : "FAIL");
  if (!result.ok) {
    console.log("\nInstaller output tail:\n" + result.stdoutTail);
    if (result.stderrTail) console.log("\nInstaller error tail:\n" + result.stderrTail);
  }
}
