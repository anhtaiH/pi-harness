import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const json = process.argv.includes("--json");
const findings = [];
const skipped = [];

const excludedDirs = new Set([
  ".git",
  ".pi-agent",
  "node_modules",
  ".pi/npm",
  "state/sessions",
  "state/package-reviews",
  "state/tmp",
]);

const textExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
  ".sh",
  ".gitignore",
]);

walk(root);

const result = { ok: findings.length === 0, findings, skipped };
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log(`ok   secret scan: ${skipped.length} protected paths skipped`);
} else {
  console.log("fail secret scan:");
  for (const finding of findings) console.log(`- ${finding.path}: ${finding.reason}`);
}
process.exit(result.ok ? 0 : 1);

function walk(dir) {
  const relDir = relative(root, dir) || ".";
  if (isExcludedDir(relDir)) {
    skipped.push(relDir);
    return;
  }

  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!stat.isFile()) continue;

    const denied = deniedPathReason(rel);
    if (denied) {
      findings.push({ path: rel, reason: denied });
      continue;
    }

    if (!isTextFile(name) || stat.size > 512 * 1024) continue;
    const text = readFileSync(path, "utf8");
    const reason = secretTextReason(text);
    if (reason) findings.push({ path: rel, reason });
  }
}

function isExcludedDir(relDir) {
  return [...excludedDirs].some((excluded) => relDir === excluded || relDir.startsWith(`${excluded}/`));
}

function deniedPathReason(relPath) {
  const base = relPath.split("/").pop() || "";
  if (/^\.env($|\.)/.test(base)) return "secret-bearing env file should not be in the lab";
  if ([".npmrc", ".netrc", "id_rsa", "id_ed25519", "auth.json"].includes(base)) return "secret-bearing auth file should not be in scanned project state";
  if (/private[-_]?key/i.test(base)) return "private-key-like filename";
  return "";
}

function isTextFile(name) {
  if (textExtensions.has(name)) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && textExtensions.has(name.slice(dot));
}

function secretTextReason(text) {
  const patterns = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
    [/\bsk-[A-Za-z0-9_-]{20,}\b/, "OpenAI-style API key"],
    [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, "GitHub token"],
    [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, "Slack token"],
    [/\bAIza[0-9A-Za-z_-]{20,}\b/, "Google API key"],
    [/\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i, "literal credential assignment"],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) return label;
  }
  return "";
}
