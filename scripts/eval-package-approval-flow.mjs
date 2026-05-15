import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const spec = "npm:@earendil-works/pi-coding-agent@0.74.0";
const approvalPath = pathFromRoot("package-approvals.json");
const lockPath = pathFromRoot("package-provenance.lock.json");
const packagePath = pathFromRoot("node_modules", "@earendil-works", "pi-coding-agent", "package.json");
const approvalBackup = existsSync(approvalPath) ? readFileSync(approvalPath, "utf8") : null;
const lockBackup = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;
const hadPackage = existsSync(packagePath);
const existingFixture = hadPackage && isEvalFixture(readFileSync(packagePath, "utf8"));
let createdFixture = false;
const outputs = [];

try {
  if (!hadPackage || existingFixture) {
    mkdirSync(dirname(packagePath), { recursive: true });
    writeFileSync(packagePath, JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.74.0", bin: { pi: "dist/cli.js" } }, null, 2), "utf8");
    createdFixture = true;
  }

  writeFileSync(approvalPath, JSON.stringify({
    version: 1,
    trackedPackages: [{ spec, status: "pending-human-review", reason: "eval fixture" }],
    approvals: []
  }, null, 2) + "\n", "utf8");

  const blocked = run(["scripts/package-provenance.mjs", "check", "--json"]);

  writeFileSync(approvalPath, JSON.stringify({
    version: 1,
    trackedPackages: [{ spec, status: "pending-human-review", reason: "eval fixture" }],
    approvals: [{
      id: "manual-eval-pi-cli",
      spec,
      status: "approved",
      reviewer: "eval-human",
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      sourceReviewVerdict: "blocked",
      sourceReviewDir: pathFromRoot("state", "package-reviews", "earendil-works_pi-coding-agent_0.74.0"),
      scope: "eval fixture only",
      rationale: "eval validates manual approval path without installing packages",
      risksAccepted: ["powerful CLI package fixture"],
      mitigations: ["fixture restored after eval"],
      verification: ["node scripts/package-provenance.mjs check --json"],
      rollback: "restore package-approvals.json and package-provenance.lock.json"
    }]
  }, null, 2) + "\n", "utf8");

  const approvalDoctor = run(["scripts/package-approval.mjs", "doctor", "--json"]);
  const approved = run(["scripts/package-provenance.mjs", "check", "--json"]);

  const blockedJson = parse(blocked.stdout);
  const approvedJson = parse(approved.stdout);
  const ok = blocked.status === 1
    && blockedJson.findings?.some((finding) => finding.includes("no valid manual approval"))
    && approvalDoctor.status === 0
    && approved.status === 0
    && approvedJson.packages?.some((entry) => entry.spec === spec && entry.manualApproval?.id === "manual-eval-pi-cli");

  console.log(JSON.stringify({ ok, blockedStatus: blocked.status, approvalDoctorStatus: approvalDoctor.status, approvedStatus: approved.status, blockedFindings: blockedJson.findings || [], approvedManualApproval: approvedJson.packages?.find((entry) => entry.spec === spec)?.manualApproval || null, outputs }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  if (approvalBackup === null) rmSync(approvalPath, { force: true });
  else writeFileSync(approvalPath, approvalBackup, "utf8");
  if (lockBackup === null) rmSync(lockPath, { force: true });
  else writeFileSync(lockPath, lockBackup, "utf8");
  if (createdFixture) rmSync(pathFromRoot("node_modules", "@earendil-works", "pi-coding-agent"), { recursive: true, force: true });
}

function isEvalFixture(raw) {
  try {
    const pkg = JSON.parse(raw);
    return pkg.name === "@earendil-works/pi-coding-agent" && pkg.version === "0.74.0" && pkg.bin?.pi === "dist/cli.js" && Object.keys(pkg).length === 3;
  } catch {
    return false;
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  outputs.push({ args, status: result.status, stdout: (result.stdout || "").slice(0, 1200), stderr: result.stderr || "" });
  return result;
}

function parse(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}
