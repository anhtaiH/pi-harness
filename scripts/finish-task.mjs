import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2);
const json = args.includes("--json");
const verboseJson = args.includes("--verbose-json");
const taskId = args.find((arg) => !arg.startsWith("--"));

if (!taskId) {
  exitWith({ ok: false, findings: ["usage: node scripts/finish-task.mjs <taskId> [--json]"] }, 2);
}

const taskJson = join(root, "state", "tasks", taskId, "task.json");
if (!existsSync(taskJson)) {
  exitWith({ ok: false, taskId, findings: [`unknown task: ${taskId}`] }, 2);
}

const taskDoctor = runJson("node", ["scripts/task-doctor.mjs", taskId, "--json"]);
const evidence = runJson("node", ["scripts/evidence-doctor.mjs", taskId, "--json"]);
const proofLedger = runJson("node", ["scripts/proof-ledger.mjs", "doctor", "--task", taskId, "--json"]);
const externalWrites = runJson("node", ["scripts/external-write.mjs", "doctor", "--task", taskId, "--json"]);
const memory = runJson("node", ["scripts/memory.mjs", "doctor", "--json"]);
const reviews = runJson("node", ["scripts/review-lane.mjs", "doctor", "--task", taskId, "--json"]);
const reviewPolicy = runJson("node", ["scripts/review-policy.mjs", "doctor", "--task", taskId, "--json"]);
const projectChecks = runJson("node", ["scripts/project-checks.mjs", "doctor", "--json"]);
const secrets = runJson("node", ["scripts/secret-scan.mjs", "--json"]);
const packageProvenance = runJson("node", ["scripts/package-provenance.mjs", "check", "--json"]);
const packageApprovals = runJson("node", ["scripts/package-approval.mjs", "doctor", "--json"]);
const toolPolicy = runJson("node", ["scripts/tool-policy.mjs", "doctor", "--json"]);
const policyProfiles = runJson("node", ["scripts/policy-profile.mjs", "doctor", "--json"]);
const writerLock = runJson("node", ["scripts/writer-lock.mjs", "doctor", "--json"]);
const evals = runJson("node", ["scripts/eval-runner.mjs", "--json"]);
const ok = taskDoctor.ok && evidence.ok && proofLedger.ok && externalWrites.ok && memory.ok && reviews.ok && reviewPolicy.ok && projectChecks.ok && secrets.ok && packageProvenance.ok && packageApprovals.ok && toolPolicy.ok && policyProfiles.ok && writerLock.ok && evals.ok;
const task = JSON.parse(readFileSync(taskJson, "utf8"));
task.updatedAt = new Date().toISOString();
task.status = ok ? "done" : "blocked";
if (ok) task.finishedAt = task.updatedAt;
writeFileSync(taskJson, `${JSON.stringify(task, null, 2)}\n`, "utf8");
const clearedPolicyProfile = ok ? clearPolicyProfileOnFinish(taskId) : null;

const summaryFile = join(root, "state", "tasks", taskId, "run-summary.md");
writeFileSync(summaryFile, renderSummary({ taskId, taskDoctor, evidence, proofLedger, externalWrites, memory, reviews, reviewPolicy, projectChecks, secrets, packageProvenance, packageApprovals, toolPolicy, policyProfiles, writerLock, evals, ok, clearedPolicyProfile }), "utf8");

exitWith({
  ok,
  taskId,
  taskDoctor,
  evidence,
  proofLedger,
  externalWrites,
  memory,
  reviews,
  reviewPolicy,
  projectChecks,
  secrets,
  packageProvenance,
  packageApprovals,
  toolPolicy,
  policyProfiles,
  writerLock,
  evals,
  clearedPolicyProfile,
  summaryFile,
  findings: [
    ...taskDoctor.findings,
    ...evidence.findings,
    ...proofLedger.findings,
    ...externalWrites.findings,
    ...memory.findings,
    ...reviews.findings,
    ...reviewPolicy.findings,
    ...projectChecks.findings,
    ...secrets.findings.map((finding) => `${finding.path}: ${finding.reason}`),
    ...packageProvenance.findings,
    ...packageApprovals.findings,
    ...toolPolicy.findings,
    ...policyProfiles.findings,
    ...writerLock.findings,
    ...evals.findings,
  ],
}, ok ? 0 : 1);

function runJson(command, commandArgs) {
  try {
    return JSON.parse(execFileSync(command, commandArgs, { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  } catch (error) {
    const stdout = String(error.stdout || "");
    if (stdout) return JSON.parse(stdout);
    throw error;
  }
}

function clearPolicyProfileOnFinish(taskId) {
  const path = join(root, "state", "tasks", taskId, "tool-policy.json");
  if (!existsSync(path)) return null;
  const policy = JSON.parse(readFileSync(path, "utf8"));
  if (!policy.clearOnFinish) return null;
  rmSync(path, { force: true });
  return { taskId, profiles: policy.profiles || [], clearedAt: new Date().toISOString(), reason: "clearOnFinish" };
}

function renderSummary(result) {
  return [
    `# Run Summary: ${result.taskId}`,
    "",
    `- Completed at: ${new Date().toISOString()}`,
    `- Task doctor: ${result.taskDoctor.ok ? "pass" : "fail"}`,
    `- Evidence: ${result.evidence.ok ? "pass" : "fail"}`,
    `- Proof ledger: ${result.proofLedger.ok ? "pass" : "fail"} (${result.proofLedger.count ?? 0} entries)`,
    `- External writes: ${result.externalWrites.ok ? "pass" : "fail"}`,
    `- Memory: ${result.memory.ok ? "pass" : "fail"} (${result.memory.count ?? 0} entries, ${(result.memory.stale || []).length} stale)` ,
    `- Reviews: ${result.reviews.ok ? "pass" : "fail"} (${result.reviews.laneCount ?? 0} lanes, ${result.reviews.findingCount ?? 0} findings)` ,
    `- Review policy: ${result.reviewPolicy.ok ? "pass" : "fail"} (${result.reviewPolicy.requirement || "none"})`,
    `- Project checks: ${result.projectChecks.ok ? "pass" : "fail"} (${result.projectChecks.summary?.enabled ?? 0}/${result.projectChecks.summary?.count ?? 0} enabled)`,
    `- Secret scan: ${result.secrets.ok ? "pass" : "fail"}`,
    `- Package provenance: ${result.packageProvenance.ok ? "pass" : "fail"}`,
    `- Package approvals: ${result.packageApprovals.ok ? "pass" : "fail"} (${result.packageApprovals.approvalCount ?? 0} approval records, ${(result.packageApprovals.warnings || []).length} warnings)`,
    `- Tool policy: ${result.toolPolicy.ok ? "pass" : "fail"}`,
    `- Policy profiles: ${result.policyProfiles.ok ? "pass" : "fail"} (${result.policyProfiles.policyCount ?? 0} task policies)` ,
    `- Cleared task policy profile: ${result.clearedPolicyProfile ? "yes" : "no"}`,
    `- Writer lock: ${result.writerLock.ok ? "pass" : "fail"}`,
    `- Evals: ${result.evals.ok ? "pass" : "fail"} (${result.evals.caseCount} cases)`,
    `- Result: ${result.ok ? "done" : "blocked"}`,
    "",
    "## Task Doctor Findings",
    "",
    result.taskDoctor.findings.length ? result.taskDoctor.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Evidence Findings",
    "",
    result.evidence.findings.length ? result.evidence.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Proof Ledger Findings",
    "",
    result.proofLedger.findings.length ? result.proofLedger.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## External Write Findings",
    "",
    result.externalWrites.findings.length ? result.externalWrites.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Memory Findings",
    "",
    result.memory.findings.length ? result.memory.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Review Findings",
    "",
    result.reviews.findings.length ? result.reviews.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Review Policy Findings",
    "",
    result.reviewPolicy.findings.length ? result.reviewPolicy.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Project Check Findings",
    "",
    result.projectChecks.findings.length ? result.projectChecks.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Secret Scan Findings",
    "",
    result.secrets.findings.length ? result.secrets.findings.map((finding) => `- ${finding.path}: ${finding.reason}`).join("\n") : "- None.",
    "",
    "## Package Provenance Findings",
    "",
    result.packageProvenance.findings.length ? result.packageProvenance.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Package Approval Findings",
    "",
    result.packageApprovals.findings.length ? result.packageApprovals.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Tool Policy Findings",
    "",
    result.toolPolicy.findings.length ? result.toolPolicy.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Policy Profile Findings",
    "",
    result.policyProfiles.findings.length ? result.policyProfiles.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Writer Lock Findings",
    "",
    result.writerLock.findings.length ? result.writerLock.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
    "## Eval Findings",
    "",
    result.evals.findings.length ? result.evals.findings.map((finding) => `- ${finding}`).join("\n") : "- None.",
    "",
  ].join("\n");
}

function exitWith(result, code) {
  if (json) {
    const payload = verboseJson ? result : compactResult(result);
    console.log(JSON.stringify(payload, null, 2));
  } else if (result.ok) {
    console.log(`ok   finished task: ${result.taskId}`);
    console.log(result.summaryFile);
  } else {
    console.log(`fail finish task: ${result.findings.join("; ")}`);
  }
  process.exit(code);
}

function compactResult(result) {
  return {
    ok: result.ok,
    taskId: result.taskId,
    summaryFile: result.summaryFile || null,
    clearedPolicyProfile: result.clearedPolicyProfile || null,
    checks: {
      taskDoctor: summarizeCheck(result.taskDoctor),
      evidence: summarizeCheck(result.evidence),
      proofLedger: summarizeCheck(result.proofLedger, { count: result.proofLedger?.count }),
      externalWrites: summarizeCheck(result.externalWrites),
      memory: summarizeCheck(result.memory, { count: result.memory?.count }),
      reviews: summarizeCheck(result.reviews, { laneCount: result.reviews?.laneCount, findingCount: result.reviews?.findingCount }),
      reviewPolicy: summarizeCheck(result.reviewPolicy, { requirement: result.reviewPolicy?.requirement, warnings: result.reviewPolicy?.warnings?.length }),
      projectChecks: summarizeCheck(result.projectChecks, { enabled: result.projectChecks?.summary?.enabled, count: result.projectChecks?.summary?.count }),
      secrets: summarizeCheck(result.secrets, { skipped: result.secrets?.skipped?.length }),
      packageProvenance: summarizeCheck(result.packageProvenance, { packageCount: result.packageProvenance?.packages?.length }),
      packageApprovals: summarizeCheck(result.packageApprovals, { approvalCount: result.packageApprovals?.approvalCount }),
      toolPolicy: summarizeCheck(result.toolPolicy),
      policyProfiles: summarizeCheck(result.policyProfiles, { policyCount: result.policyProfiles?.policyCount }),
      writerLock: summarizeCheck(result.writerLock),
      evals: summarizeCheck(result.evals, { caseCount: result.evals?.caseCount }),
    },
    findingCount: result.findings?.length || 0,
    findings: result.findings || [],
  };
}

function summarizeCheck(check, extra = {}) {
  return {
    ok: Boolean(check?.ok),
    findingCount: Array.isArray(check?.findings) ? check.findings.length : 0,
    ...extra,
  };
}
