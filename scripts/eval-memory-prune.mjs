import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, pathFromRoot } from "./lib/harness-state.mjs";

const memoryFile = pathFromRoot("state", "memory", "entries.jsonl");
const hadOriginal = existsSync(memoryFile);
const original = hadOriginal ? readFileSync(memoryFile, "utf8") : "";
const outputs = [];

try {
  ensureDir(dirname(memoryFile));
  const now = new Date().toISOString();
  writeFileSync(memoryFile, [
    JSON.stringify({ id: "mem-eval-1", kind: "rule", text: "duplicate prune target", source: "eval", scope: "pi-harness", confidence: "high", tags: [], createdAt: now, expiresAt: "" }),
    JSON.stringify({ id: "mem-eval-2", kind: "rule", text: "duplicate prune target", source: "eval", scope: "pi-harness", confidence: "high", tags: [], createdAt: now, expiresAt: "" }),
    JSON.stringify({ id: "mem-eval-3", kind: "fact", text: "stale prune target", source: "eval", scope: "pi-harness", confidence: "medium", tags: [], createdAt: now, expiresAt: "2000-01-01T00:00:00.000Z" }),
  ].join("\n") + "\n", "utf8");
  const doctorBefore = run(["scripts/memory.mjs", "doctor", "--json"]);
  const dryRun = run(["scripts/memory.mjs", "prune", "--all", "--dry-run", "--json"]);
  const prune = run(["scripts/memory.mjs", "prune", "--all", "--json"]);
  const doctorAfter = run(["scripts/memory.mjs", "doctor", "--json"]);
  const beforeJson = JSON.parse(doctorBefore.stdout || "{}");
  const dryJson = JSON.parse(dryRun.stdout || "{}");
  const pruneJson = JSON.parse(prune.stdout || "{}");
  const afterJson = JSON.parse(doctorAfter.stdout || "{}");
  const ok = doctorBefore.status === 0
    && beforeJson.stale?.length === 1
    && beforeJson.duplicates?.length === 1
    && dryRun.status === 0
    && dryJson.removed?.length === 2
    && prune.status === 0
    && pruneJson.removed?.length === 2
    && doctorAfter.status === 0
    && afterJson.count === 1
    && afterJson.stale?.length === 0
    && afterJson.duplicates?.length === 0;
  console.log(JSON.stringify({ ok, before: beforeJson, dryRemoved: dryJson.removed, after: afterJson, outputs: outputs.map(summarize) }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  if (hadOriginal) writeFileSync(memoryFile, original, "utf8");
  else rmSync(memoryFile, { force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8" });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result;
}

function summarize(item) {
  return { args: item.args, status: item.status, stdout: item.stdout.slice(0, 300), stderr: item.stderr.slice(0, 300) };
}
