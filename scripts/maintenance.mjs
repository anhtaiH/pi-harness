import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { hasFlag, pathFromRoot, printResult, shellQuote } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "help";
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply") || hasFlag(args, "--yes");

let result;
if (command === "reset") result = resetProject();
else if (command === "repair") result = repairProject();
else if (command === "update") result = updateHarness();
else if (command === "uninstall") result = uninstallHarness();
else result = helpResult();

if (json) printResult(result, json, "harness maintenance");
printHuman(result);
process.exit(result.ok ? 0 : 1);

function resetProject() {
  const metadata = readMetadata();
  const root = pathFromRoot();
  const projectRoot = metadata?.projectRoot || process.env.PI_HARNESS_PROJECT_ROOT || "";
  const findings = [];
  if (!metadata || metadata.adoptionMode !== "local") findings.push("Reset only applies to a local sidecar created by the installer/start flow.");
  if (!projectRoot || !existsSync(projectRoot)) findings.push("Could not identify the connected project root.");
  if (root === projectRoot) findings.push("Refusing to remove the project directory.");
  const actions = [
    { id: "remove-sidecar", path: root, applied: false, description: "Remove this project's local harness sidecar." },
    { id: "registry-entry", path: registryPath(), applied: false, description: "Remove this project from the local harness registry when present." },
  ];
  if (findings.length) return { ok: false, command: "reset", apply, projectRoot, harnessRoot: root, actions, next: ["Run the one-line installer again from your project when blockers are fixed."], findings };
  if (apply) {
    removeRegistryEntry(projectRoot, root);
    rmSync(root, { recursive: true, force: true });
    actions.forEach((action) => action.applied = true);
  }
  return {
    ok: true,
    command: "reset",
    apply,
    projectRoot,
    harnessRoot: root,
    actions,
    next: apply
      ? ["From the project, rerun: curl -fsSL https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install | bash"]
      : ["Preview only. To reset this project sidecar, run: " + shellQuote(join(root, "bin", "pi-harness")) + " reset --apply"],
    findings: [],
  };
}

function repairProject() {
  if (!apply) {
    return { ok: true, command: "repair", apply, next: ["Preview only. To reinstall/check this sidecar, run: ph repair --apply"], findings: [] };
  }
  const result = spawnSync(process.execPath, [join(pathFromRoot(), "scripts", "setup-wizard.mjs"), "--apply", "--install"], {
    cwd: pathFromRoot(),
    encoding: "utf8",
    timeout: 10 * 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    command: "repair",
    apply,
    stdout: (result.stdout || "").slice(-4000),
    stderr: (result.stderr || "").slice(-2000),
    next: result.status === 0 ? ["Run `ph models` if model/login setup is still needed.", "Run `ph` to open Pi."] : ["Read the error above, then run the one-line installer again."],
    findings: result.status === 0 ? [] : ["repair command failed with exit " + result.status],
  };
}

function updateHarness() {
  const commandText = "curl -fsSL https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install | bash";
  if (!apply) return { ok: true, command: "update", apply, next: ["Preview only. To update/reconnect this project, run: ph update --apply", "Equivalent: " + commandText], findings: [] };
  const result = spawnSync("bash", ["-lc", commandText], {
    cwd: process.env.PI_HARNESS_PROJECT_ROOT || process.cwd(),
    encoding: "utf8",
    timeout: 15 * 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    command: "update",
    apply,
    stdout: (result.stdout || "").slice(-4000),
    stderr: (result.stderr || "").slice(-2000),
    next: result.status === 0 ? ["Run `ph models` if needed, then `ph`."] : ["Use the printed error to retry the one-line installer."],
    findings: result.status === 0 ? [] : ["update command failed with exit " + result.status],
  };
}

function uninstallHarness() {
  return {
    ok: true,
    command: "uninstall",
    apply,
    next: [
      "For one project, use `ph reset --apply`; it removes only that project's sidecar.",
      "Full uninstall of shared source/cache is intentionally not automatic yet; move the local pi-harness folder aside only after all projects are reset.",
    ],
    findings: [],
  };
}

function helpResult() {
  return { ok: true, command: "help", apply, next: ["ph update", "ph repair", "ph reset", "ph uninstall"], findings: [] };
}

function readMetadata() {
  const file = join(pathFromRoot(), "harness.project.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function removeRegistryEntry(projectRoot, harnessRoot) {
  const file = registryPath();
  if (!existsSync(file)) return;
  const registry = JSON.parse(readFileSync(file, "utf8"));
  const projects = registry.projects && typeof registry.projects === "object" ? registry.projects : {};
  for (const [key, entry] of Object.entries(projects)) {
    if (resolve(key) === resolve(projectRoot) || resolve(String(entry?.harnessRoot || "")) === resolve(harnessRoot)) delete projects[key];
  }
  writeFileSync(file, JSON.stringify({ ...registry, projects, updatedAt: new Date().toISOString() }, null, 2) + "\n", "utf8");
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

function printHuman(result) {
  console.log("Pi Harness Maintenance");
  console.log("======================");
  console.log(`Command: ${result.command}${result.apply ? " (apply)" : " (preview)"}`);
  if (result.projectRoot) console.log("Project: " + result.projectRoot);
  if (result.harnessRoot) console.log("Harness: " + result.harnessRoot);
  if (result.stdout) console.log("\nOutput:\n" + result.stdout.trim());
  if (result.stderr) console.log("\nErrors:\n" + result.stderr.trim());
  if (result.actions?.length) {
    console.log("\nActions:");
    for (const action of result.actions) console.log(`- ${action.applied ? "✓" : "•"} ${action.description} ${action.path ? "(" + action.path + ")" : ""}`);
  }
  if (result.findings?.length) {
    console.log("\nNeeds attention:");
    for (const finding of result.findings) console.log("- " + finding);
  }
  console.log("\nNext:");
  for (const step of result.next || []) console.log("- " + step);
}
