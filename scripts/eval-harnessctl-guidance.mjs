import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    parsed = null;
  }
  return { args, status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

const learnJson = run(["scripts/harnessctl.mjs", "learn", "--json"]);
const learnHuman = run(["scripts/harnessctl.mjs", "learn"]);
const checkJson = run(["scripts/harnessctl.mjs", "check", "--json"]);

const checks = checkJson.parsed?.checks || [];
const ok = learnJson.status === 0
  && learnHuman.status === 0
  && checkJson.status === 0
  && learnJson.parsed?.lesson?.model === "brief -> work -> proof -> gate"
  && Array.isArray(learnJson.parsed?.lesson?.runNow)
  && learnJson.parsed.lesson.runNow.length > 0
  && learnHuman.stdout.includes("Learn by doing:")
  && learnHuman.stdout.includes("Run this next:")
  && checks.length > 0
  && checks.every((check) => check.advice?.why && check.advice?.try);

console.log(JSON.stringify({
  ok,
  learnJsonStatus: learnJson.status,
  learnHumanStatus: learnHuman.status,
  checkJsonStatus: checkJson.status,
  lessonTitle: learnJson.parsed?.lesson?.title,
  model: learnJson.parsed?.lesson?.model,
  runNow: learnJson.parsed?.lesson?.runNow || [],
  checkAdviceIds: checks.map((check) => check.id),
}, null, 2));
process.exit(ok ? 0 : 1);
