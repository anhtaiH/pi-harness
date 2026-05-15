import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, looksLikeSecretText } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "list";
const json = hasFlag(args, "--json");
const taskId = parseFlag(args, "--task", args.find((arg) => !arg.startsWith("--") && arg !== command));

if (!taskId) output({ ok: false, findings: ["missing --task <taskId>"] }, "proof ledger", 2);

if (command === "list") {
  const entries = readEntries(taskId);
  output({ ok: true, command, taskId, ledgerFile: rel(ledgerPath(taskId)), entries, findings: [] }, "proof ledger");
}

if (command === "doctor") {
  const entries = readEntries(taskId);
  const findings = [];
  for (const [index, entry] of entries.entries()) {
    if (!entry.id || !entry.command || !entry.createdAt) findings.push(`proof entry ${index + 1} missing id/command/createdAt`);
    if (looksLikeSecretText(JSON.stringify(entry))) findings.push(`proof entry ${entry.id || index + 1} contains secret-like text`);
  }
  output({ ok: findings.length === 0, command, taskId, ledgerFile: rel(ledgerPath(taskId)), count: entries.length, findings }, "proof ledger doctor");
}

console.error("usage: node scripts/proof-ledger.mjs list|doctor --task <taskId> [--json]");
process.exit(2);

function ledgerPath(id) {
  return pathFromRoot("state", "tasks", id, "proof-ledger.jsonl");
}

function readEntries(id) {
  const path = ledgerPath(id);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return [{ parseError: true, raw: line.slice(0, 200) }]; }
    });
}

function rel(targetPath) {
  const root = pathFromRoot();
  return String(targetPath).startsWith(root + "/") ? String(targetPath).slice(root.length + 1) : targetPath;
}

function output(result, label, code = undefined) {
  if (json) printResult(result, true, label);
  if (result.ok) console.log(`ok   ${label}: ${result.taskId}`);
  else console.log(`fail ${label}: ${(result.findings || []).join("; ")}`);
  if (result.count !== undefined) console.log(`Entries: ${result.count}`);
  process.exit(code ?? (result.ok ? 0 : 1));
}
