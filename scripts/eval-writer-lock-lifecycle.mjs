import { spawnSync } from "node:child_process";

const node = process.execPath;
const script = "scripts/writer-lock.mjs";
const outputs = [];

try {
  run(["acquire", "--task", "eval-writer-lock", "--owner", "eval", "--scope", "eval", "--ttl-minutes", "1", "--json"]);
  const status = run(["status", "--json"]);
  if (!status.stdout.includes('"active": true')) throw new Error("writer lock did not become active");
  run(["release", "--owner", "eval", "--json"]);
  const doctor = run(["doctor", "--json"]);
  if (!doctor.stdout.includes('"ok": true')) throw new Error("writer lock doctor did not pass after release");
  console.log(JSON.stringify({ ok: true, activeObserved: true, releasedObserved: true, outputs }, null, 2));
} catch (error) {
  run(["release", "--owner", "eval", "--force", "--json"], { tolerateFailure: true });
  console.log(JSON.stringify({ ok: false, error: error.message, outputs }, null, 2));
  process.exit(1);
}

function run(args, options = {}) {
  const result = spawnSync(node, [script, ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  if (!options.tolerateFailure && result.status !== 0) {
    throw new Error(`writer-lock ${args[0]} failed with ${result.status}`);
  }
  return result;
}
