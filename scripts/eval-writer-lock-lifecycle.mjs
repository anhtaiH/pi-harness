import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const node = process.execPath;
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const script = "scripts/writer-lock.mjs";
const lockPath = join(root, "state", "locks", "writer-lock.json");
const originalLock = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;
const outputs = [];

try {
  rmSync(lockPath, { force: true });
  run(["acquire", "--task", "eval-writer-lock", "--owner", "eval", "--scope", "eval", "--ttl-minutes", "1", "--json"]);
  const status = run(["status", "--json"]);
  if (!status.stdout.includes('"active": true')) throw new Error("writer lock did not become active");
  run(["release", "--owner", "eval", "--json"]);
  const doctor = run(["doctor", "--json"]);
  if (!doctor.stdout.includes('"ok": true')) throw new Error("writer lock doctor did not pass after release");
  console.log(JSON.stringify({ ok: true, activeObserved: true, releasedObserved: true, restoredPriorLock: Boolean(originalLock), outputs }, null, 2));
} catch (error) {
  run(["release", "--owner", "eval", "--force", "--json"], { tolerateFailure: true });
  console.log(JSON.stringify({ ok: false, error: error.message, outputs }, null, 2));
  process.exitCode = 1;
} finally {
  if (originalLock) writeFileSync(lockPath, originalLock, "utf8");
  else rmSync(lockPath, { force: true });
}

function run(args, options = {}) {
  const result = spawnSync(node, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  if (!options.tolerateFailure && result.status !== 0) {
    throw new Error(`writer-lock ${args[0]} failed with ${result.status}`);
  }
  return result;
}
