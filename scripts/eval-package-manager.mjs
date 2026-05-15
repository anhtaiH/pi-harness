import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";
import { installCommandText, selectPackageManager } from "./lib/package-manager.mjs";

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout || "{}"); } catch {}
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

const selection = selectPackageManager();
const setup = run(["scripts/setup-wizard.mjs", "--json"]);
const bootstrap = run(["scripts/bootstrap.mjs", "--json"]);
const packageJson = JSON.parse(readFileSync(pathFromRoot("package.json"), "utf8"));
const installAction = (setup.parsed?.actions || []).find((action) => action.id === "install-dependencies");
const packageManagerStep = (bootstrap.parsed?.steps || []).find((step) => step.id === "package-manager");
const workflow = readFileSync(pathFromRoot(".github", "workflows", "pi-harness-gates.yml"), "utf8");

const ok = packageJson.packageManager?.startsWith("pnpm@")
  && existsSync(pathFromRoot("pnpm-lock.yaml"))
  && selection.name === "pnpm"
  && installCommandText(selection) === "corepack pnpm install --frozen-lockfile"
  && setup.status === 0
  && installAction?.command === "corepack pnpm install --frozen-lockfile"
  && installAction?.packageManager?.name === "pnpm"
  && bootstrap.status === 0
  && packageManagerStep?.ok === true
  && String(packageManagerStep.detail || "").includes("pnpm")
  && workflow.includes("corepack enable")
  && workflow.includes("corepack pnpm install --frozen-lockfile")
  && !workflow.includes("cache: pnpm");

console.log(JSON.stringify({
  ok,
  packageManager: packageJson.packageManager,
  pnpmLock: existsSync(pathFromRoot("pnpm-lock.yaml")),
  selection,
  setupStatus: setup.status,
  installAction: installAction ? { command: installAction.command, packageManager: installAction.packageManager } : null,
  bootstrapStatus: bootstrap.status,
  packageManagerStep,
  workflowUsesPnpm: workflow.includes("corepack enable") && workflow.includes("corepack pnpm install --frozen-lockfile") && !workflow.includes("cache: pnpm"),
}, null, 2));
process.exit(ok ? 0 : 1);
