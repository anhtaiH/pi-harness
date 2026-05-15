import { rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const canary = pathFromRoot("state", "evals", "secret-scan-canary.txt");
const fakeKey = `sk-${"test".repeat(6)}`;
let exitCode = 0;

try {
  writeFileSync(canary, `fake test key: ${fakeKey}\n`, "utf8");
  const result = spawnSync(process.execPath, ["scripts/secret-scan.mjs", "--json"], {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
  const ok = result.status === 1 && result.stdout.includes("secret-scan-canary.txt");
  console.log(JSON.stringify({ ok, status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
  exitCode = ok ? 0 : 1;
} finally {
  rmSync(canary, { force: true });
}

process.exit(exitCode);
