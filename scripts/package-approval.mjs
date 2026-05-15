import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hasFlag, nowIso, parseFlag, pathFromRoot, printResult, readJson, looksLikeSecretText } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "doctor";
const json = hasFlag(args, "--json");
const approvalPath = pathFromRoot("package-approvals.json");

if (isMain()) {
  if (command === "list") {
    const state = approvalState();
    output({ ok: true, ...state, findings: [] }, "package approvals");
  }

  if (command === "template") {
    const spec = parseFlag(args, "--spec", "npm:@earendil-works/pi-coding-agent@0.74.0");
    const review = findReview(spec);
    const template = approvalTemplate(spec, review);
    output({ ok: true, template, findings: [] }, "package approval template");
  }

  if (command === "doctor") {
    const state = approvalState();
    const result = validateApprovalState(state);
    output({ ok: result.findings.length === 0, ...state, ...result }, "package approval doctor");
  }

  console.error("usage: node scripts/package-approval.mjs doctor|list|template [--spec npm:pkg@version] [--json]");
  process.exit(2);
}

export function approvalState() {
  const raw = readJson(approvalPath, { version: 1, trackedPackages: [], approvals: [] });
  return {
    path: approvalPath,
    version: raw.version,
    trackedPackages: Array.isArray(raw.trackedPackages) ? raw.trackedPackages : [],
    approvals: Array.isArray(raw.approvals) ? raw.approvals : [],
  };
}

export function validManualApprovalFor(spec, review = findReview(spec), now = Date.now()) {
  const state = approvalState();
  const approval = state.approvals.find((entry) => entry.spec === spec && entry.status === "approved");
  if (!approval) return null;
  const validation = validateApproval(approval, review, now);
  return validation.findings.length === 0 ? { ...approval, validation } : null;
}

export function trackedPackageSpecs() {
  return approvalState().trackedPackages.map((entry) => entry.spec).filter(Boolean);
}

function validateApprovalState(state, now = Date.now()) {
  const findings = [];
  const warnings = [];
  if (state.version !== 1) findings.push("package-approvals.json must have version 1");
  if (!Array.isArray(state.trackedPackages)) findings.push("trackedPackages must be an array");
  if (!Array.isArray(state.approvals)) findings.push("approvals must be an array");

  const specs = new Set();
  const approvedSpecs = new Set((state.approvals || []).filter((approval) => approval.status === "approved").map((approval) => approval.spec));
  for (const entry of state.trackedPackages || []) {
    if (!filled(entry.spec)) findings.push("tracked package missing spec");
    else specs.add(entry.spec);
    if (!filled(entry.status)) findings.push(`${entry.spec || "<missing>"} missing status`);
    if (!filled(entry.reason)) findings.push(`${entry.spec || "<missing>"} missing reason`);
    if (entry.status === "pending-human-review" && !approvedSpecs.has(entry.spec)) warnings.push(`${entry.spec} is pending human review`);
    if (looksLikeSecretText(JSON.stringify(entry))) findings.push(`${entry.spec || "<missing>"} contains secret-like text`);
  }

  const ids = new Set();
  for (const approval of state.approvals || []) {
    if (approval.id && ids.has(approval.id)) findings.push(`duplicate approval id: ${approval.id}`);
    if (approval.id) ids.add(approval.id);
    const review = approval.spec ? findReview(approval.spec) : null;
    const validation = validateApproval(approval, review, now);
    findings.push(...validation.findings.map((finding) => `${approval.spec || "<missing>"}: ${finding}`));
    warnings.push(...validation.warnings.map((warning) => `${approval.spec || "<missing>"}: ${warning}`));
    if (approval.spec) specs.add(approval.spec);
  }

  return { findings, warnings, trackedSpecCount: specs.size, approvalCount: (state.approvals || []).length };
}

function validateApproval(approval, review, now = Date.now()) {
  const findings = [];
  const warnings = [];
  for (const field of ["id", "spec", "status", "reviewer", "approvedAt", "expiresAt", "rationale", "rollback", "scope"]) {
    if (!filled(approval[field])) findings.push(`approval missing ${field}`);
  }
  if (approval.status && approval.status !== "approved") findings.push(`approval status must be approved, got ${approval.status}`);
  for (const field of ["risksAccepted", "mitigations", "verification"]) {
    if (!Array.isArray(approval[field]) || approval[field].length === 0 || !approval[field].every(filled)) findings.push(`approval ${field} must be a non-empty string array`);
  }
  if (!review) findings.push("approval has no matching source review");
  if (review && approval.sourceReviewVerdict && approval.sourceReviewVerdict !== review.verdict) findings.push(`sourceReviewVerdict ${approval.sourceReviewVerdict} does not match latest review ${review.verdict}`);
  if (review && review.verdict !== "blocked") warnings.push(`manual approval recorded for non-blocked review verdict ${review.verdict}`);
  if (approval.expiresAt) {
    const expiresAt = Date.parse(approval.expiresAt);
    if (Number.isNaN(expiresAt)) findings.push("approval has invalid expiresAt");
    else if (expiresAt < now) findings.push(`approval expired at ${approval.expiresAt}`);
  }
  if (approval.approvedAt && Number.isNaN(Date.parse(approval.approvedAt))) findings.push("approval has invalid approvedAt");
  if (looksLikeSecretText(JSON.stringify(approval))) findings.push("approval contains secret-like text");
  return { findings, warnings };
}

function approvalTemplate(spec, review) {
  return {
    id: `manual-${slugSpec(spec)}-${nowIso().slice(0, 10)}`,
    spec,
    status: "approved",
    reviewer: "<human-name-or-handle>",
    approvedAt: nowIso(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString(),
    sourceReviewVerdict: review?.verdict || "blocked",
    sourceReviewDir: review?.reviewDir || "<run package review first>",
    scope: "Repo-local harness CLI only; no production rollout without a separate task.",
    rationale: "<why this powerful package is accepted despite automated review block>",
    risksAccepted: [
      "CLI can execute processes and mutate files as part of normal agent operation.",
      "CLI can reference local auth/session paths but must run with project-local isolation."
    ],
    mitigations: [
      "Use bin/pi-harness with project-local PI_CODING_AGENT_DIR and session dir.",
      "Keep runtime tool policy and finish gates enabled.",
      "Re-run package review before renewal or version upgrade."
    ],
    verification: [
      "npm run harness:bootstrap",
      "npm run gates",
      "node scripts/eval-pi-wrapper-local-preference.mjs"
    ],
    rollback: "Remove the dependency or vendor artifact, clear node_modules, and fall back to global Pi or previous approved version."
  };
}

function findReview(spec) {
  const normalized = spec.replace(/^npm:/, "");
  return loadReviews().find((review) => review.spec === spec || `${review.name}@${review.version}` === normalized);
}

function loadReviews() {
  const roots = [pathFromRoot("package-reviews")];
  if (!/^(1|true|yes|on)$/i.test(process.env.PI_HARNESS_IGNORE_STATE_REVIEWS || "")) roots.push(pathFromRoot("state", "package-reviews"));
  const bySpec = new Map();
  for (const reviewRoot of roots) {
    if (!existsSync(reviewRoot)) continue;
    const direct = readdirSync(reviewRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => readJson(join(reviewRoot, entry.name, "review.json"), null))
      .filter(Boolean);
    const latest = readJson(join(reviewRoot, "latest.json"), { reviews: [] }).reviews || [];
    for (const review of [...direct, ...latest]) {
      const key = review.spec || `${review.name}@${review.version}`;
      if (!bySpec.has(key)) bySpec.set(key, review);
    }
  }
  return [...bySpec.values()];
}

function isMain() {
  return process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;
}

function slugSpec(spec) {
  return String(spec).replace(/^npm:/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function output(result, label) {
  printResult(result, json, label);
}
