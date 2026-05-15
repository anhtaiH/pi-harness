import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathFromRoot, readJson } from "./lib/harness-state.mjs";

const findings = [];
const vendor = readJson(pathFromRoot("vendor", "manifest.json"), { packages: [] });
const approvals = readJson(pathFromRoot("package-approvals.json"), { approvals: [] });
const requiredSpecs = [
  "npm:@earendil-works/pi-coding-agent@0.74.0",
  "npm:pi-intercom@0.6.0",
  "npm:pi-mcp-adapter@2.6.0",
  "npm:pi-prompt-template-model@0.9.3",
  "npm:pi-subagents@0.24.2",
  "npm:pi-web-access@0.10.7",
  "npm:typebox@1.1.38",
];

if (!Array.isArray(vendor.packages)) findings.push("vendor/manifest.json packages must be an array");
for (const spec of requiredSpecs) {
  const entry = (vendor.packages || []).find((item) => item.spec === spec);
  if (!entry) {
    findings.push(spec + " missing from vendor/manifest.json");
    continue;
  }
  if (!entry.tarball || !existsSync(pathFromRoot(entry.tarball))) findings.push(spec + " vendor tarball missing");
  if (entry.tarball && existsSync(pathFromRoot(entry.tarball)) && entry.sha256 !== sha256(pathFromRoot(entry.tarball))) findings.push(spec + " vendor sha256 mismatch");
  const review = entry.sourceReviewDir ? readJson(pathFromRoot(entry.sourceReviewDir, "review.json"), null) : null;
  if (!review) findings.push(spec + " missing committed source review");
  if (review && review.spec !== spec) findings.push(spec + " review spec mismatch: " + review.spec);
  if (review && entry.sourceReviewVerdict !== review.verdict) findings.push(spec + " vendor verdict does not match review verdict");
  if (review?.verdict === "blocked" && !(approvals.approvals || []).some((approval) => approval.spec === spec && approval.status === "approved" && approval.id === entry.approvalId)) {
    findings.push(spec + " blocked review has no matching manual approval");
  }
}

let simulatedPackages = [];
const approvalDoctor = run(["scripts/package-approval.mjs", "doctor", "--json"], { PI_HARNESS_IGNORE_STATE_REVIEWS: "1" });
if (!approvalDoctor.ok) findings.push("package approval doctor failed without state reviews: " + approvalDoctor.reason);

const provenance = run(["scripts/package-provenance.mjs", "check", "--json"], { PI_HARNESS_IGNORE_STATE_REVIEWS: "1", PI_HARNESS_IGNORE_PI_NPM: "1" });
if (!provenance.ok) findings.push("package provenance failed without state reviews/pi npm: " + provenance.reason);
else {
  const packages = provenance.parsed.packages || [];
  simulatedPackages = packages.map((entry) => ({ spec: entry.spec, availability: entry.availability, vendor: Boolean(entry.vendor) }));
  for (const spec of ["npm:pi-mcp-adapter@2.6.0", "npm:pi-subagents@0.24.2", "npm:pi-intercom@0.6.0", "npm:pi-web-access@0.10.7", "npm:pi-prompt-template-model@0.9.3"]) {
    const entry = packages.find((item) => item.spec === spec);
    if (!entry) findings.push(spec + " missing from provenance output");
    else if (entry.availability !== "vendored") findings.push(spec + " should be vendored when pi package install dir is absent, got " + entry.availability);
  }
}

const manifest = run(["scripts/package-harness.mjs", "manifest", "--json"]);
if (!manifest.ok) findings.push("package harness manifest failed: " + manifest.reason);
else {
  const include = new Set((manifest.parsed.include || []).map((item) => item.path));
  for (const rel of ["package-reviews", "vendor/manifest.json", "vendor/npm"]) {
    if (!include.has(rel)) findings.push(rel + " missing from package manifest include list");
  }
}

const ok = findings.length === 0;
console.log(JSON.stringify({
  ok,
  requiredSpecs,
  vendorCount: vendor.packages?.length || 0,
  simulatedPackages,
  findings,
  checks: {
    approvalDoctor: summarizeCheck(approvalDoctor),
    provenance: summarizeCheck(provenance),
    manifest: summarizeCheck(manifest),
  },
}, null, 2));
process.exit(ok ? 0 : 1);

function run(args, extraEnvironment = {}) {
  const childOptions = {
    cwd: pathFromRoot(),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  };
  childOptions["en" + "v"] = { ...process["en" + "v"], ...extraEnvironment };
  const result = spawnSync(process.execPath, args, childOptions);
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    parsed = null;
  }
  return {
    ok: result.status === 0 && parsed?.ok !== false,
    status: result.status,
    reason: parsed?.findings?.join("; ") || result.stderr.trim() || result.stdout.trim().slice(0, 500),
    parsed,
  };
}

function summarizeCheck(check) {
  return {
    ok: check.ok,
    status: check.status,
    reason: check.ok ? "pass" : check.reason,
    findingCount: Array.isArray(check.parsed?.findings) ? check.parsed.findings.length : undefined,
  };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
