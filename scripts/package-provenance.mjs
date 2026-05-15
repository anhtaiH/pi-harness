import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hasFlag, nowIso, pathFromRoot, printResult, readJson, writeJson } from "./lib/harness-state.mjs";
import { trackedPackageSpecs, validManualApprovalFor } from "./package-approval.mjs";

const args = process.argv.slice(2);
const command = args[0] || "check";
const json = hasFlag(args, "--json");
const settings = readJson(pathFromRoot(".pi", "settings.json"), {});
const packageJson = readJson(pathFromRoot("package.json"), {});
const reviews = loadReviews();
const vendorManifest = readJson(pathFromRoot("vendor", "manifest.json"), { packages: [] });
const piPackages = (settings.packages || []).map((spec) => ({ kind: "pi-package", spec, nodeModulesDir: pathFromRoot(".pi", "npm", "node_modules") }));
const runtimeDependencies = Object.keys(packageJson.dependencies || {}).map((name) => ({ kind: "runtime-dependency", name, nodeModulesDir: pathFromRoot("node_modules") }));
const manualTrackedPackages = trackedPackageSpecs()
  .map((spec) => ({ kind: "manual-approval-package", spec, nodeModulesDir: pathFromRoot("node_modules") }))
  .filter((item) => packageIsInstalled(item) || packageIsDeclared(packageNameFromSpec(item.spec)));
const lockFile = pathFromRoot("package-provenance.lock.json");

const entries = [...piPackages, ...runtimeDependencies, ...manualTrackedPackages].map((item) => {
  const packageName = item.name || packageNameFromSpec(item.spec);
  const packageJsonPath = join(item.nodeModulesDir, ...packageName.split("/"), "package.json");
  const installed = shouldIgnoreInstalledPackage(item) ? null : existsSync(packageJsonPath) ? readJson(packageJsonPath, null) : null;
  const spec = item.spec || `npm:${packageName}@${installed?.version || packageJson.dependencies?.[packageName] || "unknown"}`;
  const review = findReview(spec, packageName, installed?.version);
  const vendor = findVendorPackage(spec, packageName, installed?.version);
  const manualApproval = validManualApprovalFor(spec, review);
  return {
    kind: item.kind,
    spec,
    installedName: installed?.name || null,
    installedVersion: installed?.version || review?.version || vendor?.version || null,
    availability: installed?.name ? "installed" : vendor ? "vendored" : "missing",
    reviewVerdict: review?.verdict || vendor?.sourceReviewVerdict || null,
    reviewedAt: review?.reviewedAt || null,
    reviewDir: review?.reviewDir || vendor?.sourceReviewDir || null,
    vendor: vendor ? {
      tarball: vendor.tarball,
      sha256: vendor.sha256,
      exists: vendor.exists,
      sha256Matches: vendor.sha256Matches,
      approvalId: vendor.approvalId || null,
    } : null,
    manualApproval: manualApproval ? {
      id: manualApproval.id,
      reviewer: manualApproval.reviewer,
      approvedAt: manualApproval.approvedAt,
      expiresAt: manualApproval.expiresAt,
      scope: manualApproval.scope,
    } : null,
  };
});

const findings = [];
for (const entry of entries) {
  if (!entry.installedName && !entry.vendor) findings.push(`${entry.spec} is listed but not installed and has no vendored artifact`);
  if (entry.vendor && !entry.vendor.exists) findings.push(`${entry.spec} vendor tarball is missing: ${entry.vendor.tarball}`);
  if (entry.vendor && entry.vendor.exists && entry.vendor.sha256Matches === false) findings.push(`${entry.spec} vendor tarball sha256 mismatch: ${entry.vendor.tarball}`);
  if (!entry.reviewVerdict) findings.push(`${entry.spec} has no source review in latest or committed package reviews`);
  if (entry.reviewVerdict === "blocked" && !entry.manualApproval) findings.push(`${entry.spec} has blocked source-review verdict and no valid manual approval`);
}

const lock = { generatedAt: nowIso(), packages: entries };
const lockStale = lockNeedsRefresh(lockFile, entries);
if (command === "write") writeJson(lockFile, lock);

printResult({ ok: findings.length === 0, lockFile, lockStale, packages: entries, findings }, json, "package provenance");

function packageIsInstalled(item) {
  if (shouldIgnoreInstalledPackage(item)) return false;
  const packageName = item.name || packageNameFromSpec(item.spec);
  return existsSync(join(item.nodeModulesDir, ...packageName.split("/"), "package.json"));
}

function shouldIgnoreInstalledPackage(item) {
  return item.kind === "pi-package" && /^(1|true|yes|on)$/i.test(process.env.PI_HARNESS_IGNORE_PI_NPM || "");
}

function packageIsDeclared(packageName) {
  return Boolean(
    packageJson.dependencies?.[packageName] ||
    packageJson.devDependencies?.[packageName] ||
    packageJson.optionalDependencies?.[packageName]
  );
}

function findVendorPackage(spec, packageName, packageVersion) {
  const normalized = spec.replace(/^npm:/, "");
  const raw = (vendorManifest.packages || []).find((entry) => (
    entry.spec === spec ||
    entry.spec === `npm:${normalized}` ||
    `${packageName}@${packageVersion}` === entry.spec?.replace(/^npm:/, "") ||
    packageNameFromSpec(entry.spec || "") === packageName
  ));
  if (!raw) return null;
  const absTarball = pathFromRoot(raw.tarball || "");
  const exists = Boolean(raw.tarball) && existsSync(absTarball);
  const sha256Matches = exists && raw.sha256 ? sha256(absTarball) === raw.sha256 : exists ? null : false;
  const review = raw.sourceReviewDir ? readJson(pathFromRoot(raw.sourceReviewDir, "review.json"), null) : null;
  return { ...raw, exists, sha256Matches, version: review?.version || packageVersion || null };
}

function findReview(spec, packageName, packageVersion) {
  const normalized = spec.replace(/^npm:/, "");
  return reviews.find((review) => (
    review.spec === spec ||
    `${review.name}@${review.version}` === normalized ||
    (review.name === packageName && review.version === packageVersion)
  ));
}

function packageNameFromSpec(spec) {
  const raw = spec.replace(/^npm:/, "");
  if (raw.startsWith("@")) {
    const slash = raw.indexOf("/");
    const versionAt = raw.indexOf("@", slash);
    return versionAt === -1 ? raw : raw.slice(0, versionAt);
  }
  const versionAt = raw.lastIndexOf("@");
  return versionAt > 0 ? raw.slice(0, versionAt) : raw;
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

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function lockNeedsRefresh(path, packages) {
  const existing = readJson(path, null);
  return !existing || JSON.stringify(existing.packages || []) !== JSON.stringify(packages);
}
