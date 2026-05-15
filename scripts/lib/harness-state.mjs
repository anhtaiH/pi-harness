import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

export const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

export function pathFromRoot(...parts) {
  return join(root, ...parts);
}

export function readHarnessProject() {
  return readJson(pathFromRoot("harness.project.json"), null);
}

export function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_/:=.,+@%-]+$/.test(text)) return text;
  return "'" + text.replace(/'/g, "'\"'\"'") + "'";
}

export function harnessCommand(action = "pi") {
  const metadata = readHarnessProject();
  if (metadata?.adoptionMode === "local") {
    const launcher = shellQuote(pathFromRoot("bin", "pi-harness"));
    if (!action || action === "pi") return launcher;
    return `${launcher} ${action}`;
  }
  const commands = {
    setup: "npm run harness:setup",
    next: "npm run harness:next",
    learn: "npm run harness:learn",
    check: "npm run harness:check",
    ready: "npm run harness:ready",
    pi: "npm run pi",
    "pi:print": "npm run pi:print",
  };
  return commands[action] || `npm run harness -- ${action}`;
}

export function commandWithArgs(command, args) {
  const suffix = String(args || "").trim();
  if (!suffix) return command;
  return command.startsWith("npm run ") ? `${command} -- ${suffix}` : `${command} ${suffix}`;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function readJson(path, fallback = undefined) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function appendJsonl(path, value) {
  ensureDir(dirname(path));
  appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

export function nowIso() {
  return new Date().toISOString();
}

export function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function timestampId(date = new Date()) {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

export function parseFlag(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

export function hasFlag(args, name) {
  return args.includes(name);
}

/**
 * Print a machine-readable or human-readable result and terminate the process.
 * Always calls process.exit(0) on success and process.exit(1) on failure.
 * This function never returns.
 */
export function printResult(result, json, okLabel = "ok") {
  const text = json
    ? `${JSON.stringify(result, null, 2)}\n`
    : result.ok
      ? `ok   ${okLabel}\n`
      : `fail ${okLabel}: ${(result.findings || []).join("; ")}\n`;
  writeSync(1, text);
  process.exit(result.ok ? 0 : 1);
}

export function looksLikeSecretText(text) {
  return [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{12,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{12,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/,
    /\bAIza[0-9A-Za-z_-]{12,}\b/,
    /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i,
  ].some((pattern) => pattern.test(String(text)));
}

export function redact(text) {
  return String(text)
    .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?-----END [\s\S]*?PRIVATE KEY-----/g, "***REDACTED_PRIVATE_KEY***")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "***REDACTED_OPENAI_KEY***")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/g, "***REDACTED_GITHUB_TOKEN***")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/g, "***REDACTED_GITHUB_TOKEN***")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g, "***REDACTED_SLACK_TOKEN***")
    .replace(/\bAIza[0-9A-Za-z_-]{12,}\b/g, "***REDACTED_GOOGLE_KEY***")
    .replace(/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY)[A-Za-z0-9_]*=)([^\s'"`]+)/gi, "$1***");
}
