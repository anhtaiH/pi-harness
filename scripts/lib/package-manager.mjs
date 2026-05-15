import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathFromRoot } from "./harness-state.mjs";

export function selectPackageManager(root = pathFromRoot()) {
  const packageJson = readPackageJson(root);
  const wanted = packageJson.packageManager || "";
  const pnpmWanted = wanted.startsWith("pnpm@");
  const pnpmLock = existsSync(join(root, "pnpm-lock.yaml"));
  const npmLock = existsSync(join(root, "package-lock.json"));
  const corepack = commandOk("corepack", ["--version"], root);
  const pnpm = corepack && commandOk("corepack", ["pnpm", "--version"], root);

  if ((pnpmWanted || pnpmLock) && pnpm) {
    return {
      name: "pnpm",
      available: true,
      command: "corepack",
      installArgs: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
      lockfile: pnpmLock ? "pnpm-lock.yaml" : null,
      reason: corepack ? "pnpm via Corepack" : "pnpm",
      fallback: false,
    };
  }

  return {
    name: "npm",
    available: commandOk("npm", ["--version"], root),
    command: "npm",
    installArgs: ["ci"],
    lockfile: npmLock ? "package-lock.json" : null,
    reason: pnpmWanted || pnpmLock ? "pnpm unavailable; falling back to npm" : "npm lockfile",
    fallback: Boolean(pnpmWanted || pnpmLock),
  };
}

export function installCommandText(selection) {
  return [selection.command, ...selection.installArgs].join(" ");
}

function readPackageJson(root) {
  const path = join(root, "package.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function commandOk(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 30_000, stdio: "pipe" });
  return result.status === 0;
}
