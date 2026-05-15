import { existsSync, readFileSync } from "node:fs";
import { hasFlag, nowIso, parseFlag, pathFromRoot, printResult, appendJsonl } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "list";
const json = hasFlag(args, "--json");

if (command === "record") {
  const taskId = parseFlag(args, "--task", args[1]);
  const kind = parseFlag(args, "--kind", "note");
  const source = parseFlag(args, "--source", "manual");
  const scope = parseFlag(args, "--scope", "unspecified");
  const notes = parseFlag(args, "--notes", "");
  if (!taskId) printResult({ ok: false, findings: ["missing --task"] }, json, "provenance");
  const entry = { timestamp: nowIso(), taskId, kind, source, scope, notes };
  appendJsonl(pathFromRoot("state", "provenance", `${taskId}.jsonl`), entry);
  printResult({ ok: true, entry, findings: [] }, json, "provenance recorded");
}

if (command === "list") {
  const taskId = parseFlag(args, "--task", args[1]);
  if (!taskId) printResult({ ok: false, findings: ["missing --task"] }, json, "provenance");
  const path = pathFromRoot("state", "provenance", `${taskId}.jsonl`);
  const entries = existsSync(path)
    ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  if (json) console.log(JSON.stringify({ ok: true, taskId, entries, findings: [] }, null, 2));
  else console.log(entries.map((entry) => `${entry.timestamp} ${entry.kind} ${entry.source} ${entry.scope}`).join("\n") || "No provenance entries.");
  process.exit(0);
}

console.error("usage: node scripts/provenance.mjs record|list --task id [--kind kind --source source --scope scope --notes text] [--json]");
process.exit(2);
