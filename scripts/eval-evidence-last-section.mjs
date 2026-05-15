import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const taskId = "eval-evidence-last-section";
const taskDir = pathFromRoot("state", "tasks", taskId);

try {
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(pathFromRoot("state", "tasks", taskId, "evidence.md"), `# Evidence: ${taskId}

## Summary

Evidence parser eval.

## Positive Proof

- Command or inspection: generated fixture
- Result: PASS

## Negative Proof

- Regression or failure-mode check: memory candidates is the final section without a sentinel heading
- Result: PASS

## Commands Run

\`\`\`text
node scripts/evidence-doctor.mjs ${taskId} --json
\`\`\`

## Skipped Checks

- Check: dedicated markdown lint
- Reason: no markdown linter is defined for this synthetic fixture
- Residual risk: none identified

## Diff Risk Notes

- Risk: parser regression
- Mitigation: eval fixture

## Memory Candidates

- Candidate: Evidence section parsing must handle the final section without a following heading.
- Source: eval fixture
- Confidence: high
`, "utf8");
  const result = spawnSync(process.execPath, ["scripts/evidence-doctor.mjs", taskId, "--json"], {
    cwd: pathFromRoot(),
    encoding: "utf8",
  });
  const doctor = JSON.parse(result.stdout || "{}");
  const ok = result.status === 0 && doctor.ok;
  console.log(JSON.stringify({ ok, status: result.status, findings: doctor.findings || [] }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(taskDir, { recursive: true, force: true });
}
