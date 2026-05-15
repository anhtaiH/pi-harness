import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, pathFromRoot } from "./lib/harness-state.mjs";

const memoryFile = pathFromRoot("state", "memory", "entries.jsonl");
const hadOriginal = existsSync(memoryFile);
const original = hadOriginal ? readFileSync(memoryFile, "utf8") : "";

try {
  ensureDir(dirname(memoryFile));
  if (!hadOriginal) rmSync(memoryFile, { force: true });
  const add = run([
    "scripts/memory.mjs",
    "add",
    "--kind",
    "rule",
    "--text",
    "Runtime policy smoke tests should avoid exposing secret file contents.",
    "--source",
    "eval-memory-flow",
    "--scope",
    "pi-harness",
    "--confidence",
    "high",
    "--tags",
    "runtime,policy,smoke",
    "--json",
  ]);
  const search = run(["scripts/memory.mjs", "search", "--query", "runtime policy", "--json"]);
  const doctor = run(["scripts/memory.mjs", "doctor", "--json"]);
  const blocked = run([
    "scripts/memory.mjs",
    "add",
    "--kind",
    "fact",
    "--text",
    `api_key='${["sk", "this", "is", "a", "fake", "secret", "like", "value", "for", "eval"].join("-" )}'`,
    "--source",
    "eval-memory-flow",
    "--json",
  ]);
  const addJson = JSON.parse(add.stdout || "{}");
  const searchJson = JSON.parse(search.stdout || "{}");
  const doctorJson = JSON.parse(doctor.stdout || "{}");
  const blockedJson = JSON.parse(blocked.stdout || "{}");
  const ok = add.status === 0 && search.status === 0 && doctor.status === 0 && blocked.status === 1 && searchJson.entries?.some((entry) => entry.id === addJson.entry?.id) && doctorJson.ok && blockedJson.findings?.some((finding) => finding.includes("secret-like"));
  console.log(JSON.stringify({ ok, added: addJson.entry?.id, searchCount: searchJson.entries?.length || 0, blockedFindings: blockedJson.findings || [] }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  if (hadOriginal) writeFileSync(memoryFile, original, "utf8");
  else rmSync(memoryFile, { force: true });
}

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
}
