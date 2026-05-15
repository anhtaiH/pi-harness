import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, pathFromRoot } from "./lib/harness-state.mjs";

const memoryFile = pathFromRoot("state", "memory", "entries.jsonl");
const importFile = pathFromRoot("state", "tmp", "memory-import-ranking-eval.jsonl");
const hadOriginal = existsSync(memoryFile);
const original = hadOriginal ? readFileSync(memoryFile, "utf8") : "";
const outputs = [];

try {
  ensureDir(dirname(memoryFile));
  ensureDir(dirname(importFile));
  writeFileSync(memoryFile, "", "utf8");
  writeFileSync(importFile, [
    JSON.stringify({ kind: "fact", text: "runtime policy profile import ranking can find imported notes", confidence: "low", tags: ["runtime", "ranking"] }),
    JSON.stringify({ kind: "rule", text: "runtime policy profile import ranking prefers sourced high confidence entries", confidence: "high", tags: ["runtime", "ranking", "policy-profile"] }),
  ].join("\n") + "\n", "utf8");

  const imported = run(["scripts/memory.mjs", "import", "--file", "state/tmp/memory-import-ranking-eval.jsonl", "--source", "eval-memory-import-ranking", "--scope", "pi-harness", "--tags", "import-eval", "--json"]);
  const duplicateDryRun = run(["scripts/memory.mjs", "import", "--file", "state/tmp/memory-import-ranking-eval.jsonl", "--source", "eval-memory-import-ranking", "--dry-run", "--json"]);
  const search = run(["scripts/memory.mjs", "search", "--query", "runtime policy profile import ranking", "--scores", "--json"]);
  const doctor = run(["scripts/memory.mjs", "doctor", "--json"]);

  const importedJson = JSON.parse(imported.stdout || "{}");
  const duplicateJson = JSON.parse(duplicateDryRun.stdout || "{}");
  const searchJson = JSON.parse(search.stdout || "{}");
  const doctorJson = JSON.parse(doctor.stdout || "{}");
  const first = searchJson.entries?.[0];
  const ok = imported.status === 0
    && duplicateDryRun.status === 0
    && search.status === 0
    && doctor.status === 0
    && importedJson.imported?.length === 2
    && duplicateJson.skipped?.length === 2
    && first?.kind === "rule"
    && first?.confidence === "high"
    && doctorJson.ok;
  console.log(JSON.stringify({ ok, imported: importedJson.imported?.length || 0, duplicateSkipped: duplicateJson.skipped?.length || 0, first: first?.text, scores: searchJson.scores, outputs: outputs.map(summarize) }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  if (hadOriginal) writeFileSync(memoryFile, original, "utf8");
  else rmSync(memoryFile, { force: true });
  rmSync(importFile, { force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8" });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result;
}

function summarize(item) {
  return { args: item.args, status: item.status, stdout: item.stdout.slice(0, 300), stderr: item.stderr.slice(0, 300) };
}
