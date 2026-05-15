import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-review-lane-run-dry";
const reviewDir = pathFromRoot("state", "reviews", taskId);
const outputs = [];

try {
  rmSync(reviewDir, { recursive: true, force: true });
  const runDry = run([
    "scripts/review-lane.mjs",
    "run",
    "--task",
    taskId,
    "--lane",
    "safety",
    "--reviewer",
    "eval-reviewer",
    "--scope",
    "bounded review lane dry-run",
    "--prompt",
    "Review runtime policy and external-write controls without editing files.",
    "--dry-run",
    "--json",
  ]);
  const runJson = JSON.parse(runDry.stdout || "{}");
  const doctor = run(["scripts/review-lane.mjs", "doctor", "--task", taskId, "--json"]);
  const synthesize = run(["scripts/review-lane.mjs", "synthesize", "--task", taskId, "--json"]);
  const doctorJson = JSON.parse(doctor.stdout || "{}");
  const synthesizeJson = JSON.parse(synthesize.stdout || "{}");
  const ok = runDry.status === 0
    && runJson.dryRun === true
    && runJson.run?.status === "dry-run"
    && existsSync(runJson.promptFile || "")
    && doctor.status === 0
    && doctorJson.runCount === 1
    && synthesize.status === 0
    && synthesizeJson.runs === 1;
  console.log(JSON.stringify({ ok, run: runJson.run?.id, promptFileExists: existsSync(runJson.promptFile || ""), doctor: doctorJson, outputs: outputs.map(summarize) }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(reviewDir, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8" });
  outputs.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result;
}

function summarize(item) {
  return { args: item.args, status: item.status, stdout: item.stdout.slice(0, 300), stderr: item.stderr.slice(0, 300) };
}
