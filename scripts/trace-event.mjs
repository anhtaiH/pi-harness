import { hasFlag, nowIso, parseFlag, pathFromRoot, printResult, appendJsonl, writeJson, readJson, slug, timestampId } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "event";
const json = hasFlag(args, "--json");
const runId = parseFlag(args, "--run", `run-${timestampId()}`);
const traceFile = pathFromRoot("state", "traces", `${slug(runId)}.jsonl`);

const entry = {
  timestamp: nowIso(),
  runId,
  type: command,
  taskId: parseFlag(args, "--task", ""),
  label: parseFlag(args, "--label", ""),
  status: parseFlag(args, "--status", ""),
  data: safeJson(parseFlag(args, "--data-json", "{}")),
};

appendJsonl(traceFile, entry);
writeJson(pathFromRoot("state", "traces", "latest.json"), { runId, traceFile, latestEvent: entry });

printResult({ ok: true, traceFile, entry, findings: [] }, json, "trace event");

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return { raw: value };
  }
}
