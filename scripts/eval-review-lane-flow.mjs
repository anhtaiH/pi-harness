import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-review-lane-flow";
const reviewDir = pathFromRoot("state", "reviews", taskId);

try {
  rmSync(reviewDir, { recursive: true, force: true });
  const plan = run([
    "scripts/review-lane.mjs",
    "plan",
    "--task",
    taskId,
    "--lane",
    "safety",
    "--reviewer",
    "eval-reviewer",
    "--scope",
    "runtime policy changes",
    "--prompt",
    "Review for secret exposure and policy bypasses.",
    "--json",
  ]);
  const laneId = JSON.parse(plan.stdout || "{}").lane?.id;
  const finding = run([
    "scripts/review-lane.mjs",
    "finding",
    "--task",
    taskId,
    "--lane-id",
    laneId,
    "--severity",
    "low",
    "--title",
    "Document runtime smoke residual risk",
    "--detail",
    "Live runtime smoke may vary by provider.",
    "--recommendation",
    "Keep script evals and add provider-specific live smoke when needed.",
    "--source",
    "eval-reviewer",
    "--json",
  ]);
  const synthesize = run(["scripts/review-lane.mjs", "synthesize", "--task", taskId, "--json"]);
  const doctor = run(["scripts/review-lane.mjs", "doctor", "--task", taskId, "--json"]);
  const unknown = run([
    "scripts/review-lane.mjs",
    "finding",
    "--task",
    taskId,
    "--lane-id",
    "missing-lane",
    "--title",
    "Bad lane",
    "--detail",
    "Should be rejected.",
    "--recommendation",
    "Reject unknown lane.",
    "--json",
  ]);
  const doctorJson = JSON.parse(doctor.stdout || "{}");
  const unknownJson = JSON.parse(unknown.stdout || "{}");
  const ok = plan.status === 0 && finding.status === 0 && synthesize.status === 0 && doctor.status === 0 && unknown.status === 1 && doctorJson.laneCount === 1 && doctorJson.findingCount === 1 && unknownJson.findings?.some((item) => item.includes("unknown lane"));
  console.log(JSON.stringify({ ok, laneId, doctor: doctorJson, unknownFindings: unknownJson.findings || [] }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(reviewDir, { recursive: true, force: true });
}

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
}
