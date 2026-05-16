import { accessSync, constants, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { pathFromRoot, shellQuote } from "./lib/harness-state.mjs";

const human = process.argv.includes("--human");
const disabled = process.env.PI_HARNESS_INSTALL_PH === "0";
const result = disabled ? { ok: true, disabled: true, shim: "", onPath: false, findings: [] } : installShim();
if (human) printHuman(result);
else console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

function installShim() {
  const dir = chooseDir();
  if (!dir) return { ok: false, shim: "", onPath: false, findings: ["Could not choose a writable command directory."] };
  try {
    mkdirSync(dir, { recursive: true });
    const shim = join(dir, "ph");
    const launcher = shellQuote(pathFromRoot("bin", "pi-harness"));
    const body = ["#!/usr/bin/env bash", `${launcher} "$@"`, ""].join("\n");
    writeFileSync(shim, body, { mode: 0o755 });
    return { ok: true, shim, onPath: pathDirs().includes(dir), findings: [] };
  } catch (error) {
    return { ok: false, shim: "", onPath: false, findings: ["Could not write the short ph command: " + (error?.message || error)] };
  }
}

function printHuman(result) {
  if (result.disabled) return;
  if (!result.ok) {
    console.log("Could not install the short `ph` command. The direct launcher below will still work.");
    return;
  }
  console.log("Installed short command: " + result.shim);
  if (!result.onPath) console.log("If `ph` is not found, open a new terminal or use the direct launcher printed below.");
}

function chooseDir() {
  if (process.env.PI_HARNESS_BIN_DIR) return process.env.PI_HARNESS_BIN_DIR;
  const home = process.env.HOME || "";
  const pathOnPath = new Set(pathDirs());
  // Prefer stable user-controlled directories that are also on PATH.
  const preferred = [
    home ? join(home, ".local", "bin") : "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    home ? join(home, "bin") : "",
  ].filter(Boolean);
  for (const dir of preferred) {
    if (!pathOnPath.has(dir)) continue;
    if (isUsableDir(dir)) return dir;
  }
  // Fall back to any PATH entry the user owns, but never inside a managed agent/state directory.
  for (const dir of pathDirs()) {
    if (!dir) continue;
    if (!home || !dir.startsWith(home)) continue;
    if (/\.(pi-agent|pi|cache|cargo|asdf|nvm)\b/.test(dir)) continue;
    if (isUsableDir(dir)) return dir;
  }
  // Last resort: ~/.local/bin (we will warn that PATH does not include it).
  return home ? join(home, ".local", "bin") : "";
}

function pathDirs() {
  return String(process.env.PATH || "").split(delimiter).filter(Boolean);
}

function isUsableDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
