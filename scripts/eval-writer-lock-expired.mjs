import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot, writeJson } from "./lib/harness-state.mjs";

const lockFile = pathFromRoot("state", "locks", "writer-lock.json");
const originalLock = existsSync(lockFile) ? readFileSync(lockFile, "utf8") : null;
let exitCode = 0;

try {
  writeJson(lockFile, {
    taskId: "eval-expired-lock",
    owner: "eval",
    scope: "eval",
    acquiredAt: "2000-01-01T00:00:00.000Z",
    expiresAt: "2000-01-01T00:01:00.000Z",
  });
  const result = spawnSync(process.execPath, ["scripts/writer-lock.mjs", "doctor", "--json"], {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
  const ok = result.status === 1 && result.stdout.includes("expired lock remains");
  console.log(JSON.stringify({ ok, status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
  exitCode = ok ? 0 : 1;
} finally {
  if (originalLock) writeFileSync(lockFile, originalLock, "utf8");
  else rmSync(lockFile, { force: true });
}

process.exit(exitCode);
