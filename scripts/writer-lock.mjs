import { hasFlag, nowIso, parseFlag, pathFromRoot, printResult, readJson, writeJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "status";
const json = hasFlag(args, "--json");
const lockFile = pathFromRoot("state", "locks", "writer-lock.json");

if (command === "status" || command === "doctor") {
  const lock = currentLock();
  const active = lock && !isExpired(lock);
  const findings = [];
  if (lock && !active) findings.push(`expired lock remains for ${lock.taskId}`);
  printResult({ ok: findings.length === 0, active, lock, findings }, json, "writer lock");
}

if (command === "acquire") {
  const taskId = parseFlag(args, "--task", args[1]);
  const owner = parseFlag(args, "--owner", process.env.USER || "unknown");
  const scope = parseFlag(args, "--scope", "implementation");
  const ttlMinutes = Number(parseFlag(args, "--ttl-minutes", "120"));
  if (!taskId) exitResult({ ok: false, findings: ["missing --task"] }, "writer lock");
  const existing = currentLock();
  if (existing && !isExpired(existing) && existing.owner !== owner) {
    exitResult({ ok: false, findings: [`active writer lock held by ${existing.owner} for ${existing.taskId}`], lock: existing }, "writer lock");
  }
  const lock = { taskId, owner, scope, acquiredAt: nowIso(), expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString() };
  writeJson(lockFile, lock);
  printResult({ ok: true, active: true, lock, findings: [] }, json, "writer lock acquired");
}

if (command === "release") {
  const owner = parseFlag(args, "--owner", process.env.USER || "unknown");
  const existing = currentLock();
  if (!existing) exitResult({ ok: true, active: false, findings: [] }, "writer lock released");
  if (existing.owner !== owner && !hasFlag(args, "--force")) {
    exitResult({ ok: false, findings: [`lock owner mismatch: ${existing.owner} != ${owner}`], lock: existing }, "writer lock release");
  }
  writeJson(lockFile, { releasedAt: nowIso(), previous: existing });
  printResult({ ok: true, active: false, findings: [], previous: existing }, json, "writer lock released");
}

console.error("usage: node scripts/writer-lock.mjs status|doctor|acquire|release [--task id --owner name --scope scope --ttl-minutes n --force] [--json]");
process.exit(2);

function currentLock() {
  const lock = readJson(lockFile, null);
  if (!lock || lock.releasedAt) return null;
  return lock;
}

function isExpired(lock) {
  return Boolean(lock.expiresAt && Date.parse(lock.expiresAt) < Date.now());
}

function exitResult(result, label) {
  printResult(result, json, label);
  throw new Error("unreachable after printResult");
}
