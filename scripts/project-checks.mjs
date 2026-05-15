import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { hasFlag, parseFlag, pathFromRoot, printResult, readHarnessProject, readJson, redact, shellQuote, writeJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "detect";
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply");
const runAll = hasFlag(args, "--all");
const tierFilter = parseFlag(args, "--tier", "");
const profile = parseFlag(args, "--profile", "standard");
const projectRoot = resolve(parseFlag(args, "--project-root", resolveProjectRoot()));
const configPath = resolve(parseFlag(args, "--config", defaultConfigPath()));
const adapterPath = resolve(parseFlag(args, "--adapter", defaultAdapterPath()));

if (command === "detect") {
  const detection = detectChecks(projectRoot, { profile });
  const findings = validateChecks(detection.checks).filter((finding) => finding.severity === "error").map((finding) => finding.message);
  const result = {
    ok: findings.length === 0,
    command: "detect",
    generatedAt: new Date().toISOString(),
    projectRoot,
    configPath: rel(configPath),
    adapterPath: rel(adapterPath),
    profile,
    summary: summarize(detection.checks),
    checks: detection.checks,
    warnings: detection.warnings,
    findings,
    next: nextSteps(detection.checks),
  };
  if (apply && result.ok) saveDetected(result);
  output(result, "project checks detected");
}

if (command === "list") {
  const state = loadOrDetect();
  output({ ok: true, command: "list", projectRoot, configPath: rel(configPath), profile: state.profile || profile, summary: summarize(state.checks), checks: state.checks, latestRun: latestRunSummary(), warnings: state.warnings || [], findings: [] }, "project checks");
}

if (command === "doctor") {
  const state = loadOrDetect();
  const validation = validateChecks(state.checks);
  const findings = validation.filter((finding) => finding.severity === "error").map((finding) => finding.message);
  const warnings = [...(state.warnings || []), ...validation.filter((finding) => finding.severity === "warning").map((finding) => finding.message)];
  output({ ok: findings.length === 0, command: "doctor", projectRoot, configPath: rel(configPath), profile: state.profile || profile, summary: summarize(state.checks), latestRun: latestRunSummary(), warnings, findings }, "project checks doctor");
}

if (command === "run") {
  const state = loadOrDetect();
  const validation = validateChecks(state.checks);
  const validationFindings = validation.filter((finding) => finding.severity === "error").map((finding) => finding.message);
  const selected = selectChecks(state.checks, state.profile || profile);
  const results = validationFindings.length ? [] : selected.map(runCheck);
  const findings = [
    ...validationFindings,
    ...results.filter((result) => !result.ok).map((result) => `${result.id}: ${result.reason}`),
  ];
  const runRecord = {
    ok: findings.length === 0,
    command: "run",
    generatedAt: new Date().toISOString(),
    projectRoot,
    configPath: rel(configPath),
    profile: state.profile || profile,
    selected: selected.map((check) => check.id),
    results,
    warnings: state.warnings || [],
    findings,
  };
  const artifacts = saveRunRecord(runRecord);
  output({ ...runRecord, artifacts }, "project checks run");
}

console.error("usage: node scripts/project-checks.mjs detect|list|doctor|run [--apply] [--project-root path] [--config path] [--adapter path] [--profile quick|standard|full] [--tier quick|standard|full] [--all] [--json]");
process.exit(2);

function resolveProjectRoot() {
  if (process.env.PI_HARNESS_PROJECT_ROOT) return process.env.PI_HARNESS_PROJECT_ROOT;
  const metadata = readHarnessProject();
  if (metadata?.projectRoot) return metadata.projectRoot;
  return pathFromRoot();
}

function defaultConfigPath() {
  return pathFromRoot("state", "setup", "project-checks.json");
}

function defaultAdapterPath() {
  return pathFromRoot("state", "setup", "project-adapter.harness.json");
}

function detectChecks(root, options = {}) {
  const selectedProfile = ["quick", "standard", "full"].includes(options.profile) ? options.profile : "standard";
  const checks = [];
  const warnings = [];
  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
      const scripts = pkg.scripts || {};
      const runner = packageRunner(root);
      const scriptCatalog = [
        { name: "typecheck", kind: "typecheck", tier: "quick", confidence: "high", expectedDuration: "fast", aliases: ["typecheck", "type-check", "tsc"] },
        { name: "lint", kind: "lint", tier: "quick", confidence: "high", expectedDuration: "fast", aliases: ["lint", "eslint"] },
        { name: "test", kind: "unit-test", tier: "standard", confidence: "medium", expectedDuration: "normal", aliases: ["test", "unit", "test:unit"] },
        { name: "build", kind: "build", tier: "standard", confidence: "medium", expectedDuration: "normal", aliases: ["build"] },
        { name: "e2e", kind: "e2e", tier: "full", confidence: "low", expectedDuration: "slow", requiresServices: true, aliases: ["e2e", "test:e2e", "playwright", "cypress"] },
      ];
      for (const entry of scriptCatalog) {
        const scriptName = entry.aliases.find((name) => Object.prototype.hasOwnProperty.call(scripts, name));
        if (!scriptName) continue;
        checks.push(check({
          id: npmId(scriptName),
          command: runScriptCommand(runner, scriptName),
          kind: entry.kind,
          tier: entry.tier,
          enabled: enabledForProfile(entry.tier, selectedProfile),
          confidence: entry.confidence,
          expectedDuration: entry.expectedDuration,
          requiresServices: Boolean(entry.requiresServices),
          source: "package.json#scripts." + scriptName,
          reason: `Detected package script ${scriptName}.`,
        }));
      }
    } catch (error) {
      warnings.push(`Could not parse package.json: ${String(error.message || error)}`);
    }
  }

  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "pytest.ini"))) {
    checks.push(check({ id: "pytest", command: "pytest", kind: "unit-test", tier: "standard", enabled: enabledForProfile("standard", selectedProfile), confidence: "medium", expectedDuration: "normal", source: "python", reason: "Detected Python project metadata." }));
    checks.push(check({ id: "ruff", command: "ruff check .", kind: "lint", tier: "quick", enabled: enabledForProfile("quick", selectedProfile), confidence: "medium", expectedDuration: "fast", source: "python", reason: "Detected Python project metadata." }));
  }
  if (existsSync(join(root, "go.mod"))) {
    checks.push(check({ id: "go-test", command: "go test ./...", kind: "unit-test", tier: "standard", enabled: enabledForProfile("standard", selectedProfile), confidence: "high", expectedDuration: "normal", source: "go.mod", reason: "Detected Go module." }));
  }
  if (existsSync(join(root, "Cargo.toml"))) {
    checks.push(check({ id: "cargo-test", command: "cargo test", kind: "unit-test", tier: "standard", enabled: enabledForProfile("standard", selectedProfile), confidence: "high", expectedDuration: "normal", source: "Cargo.toml", reason: "Detected Rust crate." }));
    checks.push(check({ id: "cargo-clippy", command: "cargo clippy --all-targets -- -D warnings", kind: "lint", tier: "standard", enabled: false, confidence: "medium", expectedDuration: "normal", source: "Cargo.toml", reason: "Detected Rust crate; clippy can be slower/noisier." }));
  }
  if (existsSync(join(root, "Makefile"))) {
    const makefile = readFileSync(join(root, "Makefile"), "utf8");
    for (const target of ["test", "lint", "typecheck", "build"]) {
      if (new RegExp(`^${target}:`, "m").test(makefile)) {
        const tier = target === "lint" || target === "typecheck" ? "quick" : "standard";
        checks.push(check({ id: `make-${target}`, command: `make ${target}`, kind: target === "test" ? "unit-test" : target, tier, enabled: enabledForProfile(tier, selectedProfile), confidence: "medium", expectedDuration: tier === "quick" ? "fast" : "normal", source: `Makefile#${target}`, reason: `Detected Makefile target ${target}.` }));
      }
    }
  }

  const byId = new Map();
  for (const item of checks) if (!byId.has(item.id)) byId.set(item.id, item);
  const deduped = [...byId.values()].sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.id.localeCompare(b.id));
  if (deduped.length === 0) warnings.push("No common project checks detected; add checks manually to state/setup/project-checks.json or an adapter.");
  return { checks: deduped, warnings };
}

function packageRunner(root) {
  if (existsSync(join(root, "pnpm-lock.yaml")) && commandOk("pnpm", ["--version"], root)) return "pnpm";
  if (existsSync(join(root, "yarn.lock")) && commandOk("yarn", ["--version"], root)) return "yarn";
  if ((existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) && commandOk("bun", ["--version"], root)) return "bun";
  return "npm";
}

function commandOk(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: "utf8", timeout: 10_000, stdio: "pipe" });
  return result.status === 0;
}

function runScriptCommand(runner, scriptName) {
  if (runner === "yarn") return `yarn ${shellQuote(scriptName)}`;
  return `${runner} run ${shellQuote(scriptName)}`;
}

function check(value) {
  return {
    id: value.id,
    command: value.command,
    kind: value.kind,
    tier: value.tier,
    enabled: Boolean(value.enabled),
    readOnly: true,
    confidence: value.confidence || "medium",
    expectedDuration: value.expectedDuration || "unknown",
    requiresServices: Boolean(value.requiresServices),
    source: value.source,
    reason: value.reason,
  };
}

function npmId(scriptName) {
  return String(scriptName).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "script";
}

function enabledForProfile(tier, selectedProfile) {
  const rank = tierRank(tier);
  if (selectedProfile === "quick") return rank <= tierRank("quick");
  if (selectedProfile === "full") return rank <= tierRank("full");
  return rank <= tierRank("standard");
}

function loadOrDetect() {
  const saved = readJson(configPath, null);
  if (saved?.checks) return saved;
  return { ...detectChecks(projectRoot), generatedAt: new Date().toISOString(), projectRoot };
}

function saveDetected(result) {
  const payload = {
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    projectRoot,
    profile: result.profile || profile,
    checks: result.checks,
    warnings: result.warnings,
  };
  writeJson(configPath, payload);
  writeJson(adapterPath, {
    version: 1,
    name: basename(projectRoot) || "project",
    description: "Generated local Pi harness adapter. Review before treating as team policy.",
    projectRoot,
    riskDefault: "yellow",
    docs: ["README.md"].filter((doc) => existsSync(join(projectRoot, doc))),
    checks: result.checks.map((item) => ({ id: item.id, command: item.command, tier: item.tier, enabled: item.enabled, readOnly: item.readOnly, confidence: item.confidence, expectedDuration: item.expectedDuration, requiresServices: item.requiresServices, source: item.source })),
    reviewPolicy: { green: "none", yellow: "recommended", red: "required" },
    stopConditions: [
      "Stop if private material is required.",
      "Stop if production-affecting action is required without approval.",
      "Stop if configured project checks are destructive or externally visible.",
    ],
  });
}

function validateChecks(checks) {
  const findings = [];
  const seen = new Set();
  for (const item of checks || []) {
    if (!item.id) findings.push({ severity: "error", message: "project check missing id" });
    if (item.id && seen.has(item.id)) findings.push({ severity: "error", message: `duplicate project check id ${item.id}` });
    if (item.id) seen.add(item.id);
    if (!item.command) findings.push({ severity: "error", message: `project check ${item.id || "<missing>"} missing command` });
    if (item.command && /\b(deploy|publish|release|terraform apply|kubectl apply|gh release|npm publish)\b/i.test(item.command)) {
      const severity = item.enabled === false ? "warning" : "error";
      findings.push({ severity, message: `project check ${item.id || item.command} looks write-like; keep finish checks local/read-only` });
    }
    if (item.command && /\b(?:TOKEN|SECRET|PASSWORD|API_KEY)\b/i.test(item.command)) {
      findings.push({ severity: "error", message: `project check ${item.id || item.command} references secret-like environment names` });
    }
    if (item.tier && !["quick", "standard", "full"].includes(item.tier)) findings.push({ severity: "error", message: `project check ${item.id} has invalid tier ${item.tier}` });
  }
  return findings;
}

function selectChecks(checks, selectedProfile = profile) {
  return (checks || [])
    .filter((item) => runAll || item.enabled !== false)
    .filter((item) => !tierFilter || item.tier === tierFilter)
    .filter((item) => runAll || !selectedProfile || enabledForProfile(item.tier, selectedProfile))
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || String(a.id).localeCompare(String(b.id)));
}

function runCheck(item) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(item.command, {
    cwd: projectRoot,
    shell: true,
    encoding: "utf8",
    timeout: Number(parseFlag(args, "--timeout-ms", "120000")) || 120000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const stdout = redact(result.stdout || "").slice(0, 4000);
  const stderr = redact(result.stderr || "").slice(0, 4000);
  const ok = result.status === 0;
  return {
    id: item.id,
    ok,
    status: result.status,
    signal: result.signal,
    tier: item.tier,
    kind: item.kind,
    command: item.command,
    startedAt,
    finishedAt: new Date().toISOString(),
    reason: ok ? "pass" : stderr.trim().slice(0, 240) || stdout.trim().slice(0, 240) || `exit ${result.status}`,
    stdout,
    stderr,
  };
}

function saveRunRecord(runRecord) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const dir = pathFromRoot("state", "setup", "project-check-runs");
  const runPath = join(dir, `run-${stamp}.json`);
  const latestPath = join(dir, "latest.json");
  writeJson(runPath, runRecord);
  writeJson(latestPath, runRecord);
  return { run: rel(runPath), latest: rel(latestPath) };
}

function latestRunSummary() {
  const latest = readJson(pathFromRoot("state", "setup", "project-check-runs", "latest.json"), null);
  if (!latest) return null;
  return {
    ok: latest.ok,
    generatedAt: latest.generatedAt,
    selected: latest.selected || [],
    passed: (latest.results || []).filter((item) => item.ok).length,
    failed: (latest.results || []).filter((item) => !item.ok).length,
  };
}

function summarize(checks) {
  const enabled = (checks || []).filter((item) => item.enabled !== false);
  return {
    count: (checks || []).length,
    enabled: enabled.length,
    quick: enabled.filter((item) => item.tier === "quick").length,
    standard: enabled.filter((item) => item.tier === "standard").length,
    full: enabled.filter((item) => item.tier === "full").length,
    highConfidence: enabled.filter((item) => item.confidence === "high").length,
    mediumConfidence: enabled.filter((item) => item.confidence === "medium").length,
    lowConfidence: enabled.filter((item) => item.confidence === "low").length,
  };
}

function nextSteps(checks) {
  if (!checks.length) return ["Add local checks manually, then rerun `project-checks doctor`."];
  const setupCommand = "node scripts/project-checks.mjs detect --apply";
  return [
    `Review detected checks, then save them with \`${setupCommand}\`.`,
    "Disable slow/destructive checks before using them as finish gates.",
    "Run enabled checks with `node scripts/project-checks.mjs run --json`.",
  ];
}

function tierRank(tier) {
  return { quick: 0, standard: 1, full: 2 }[tier] ?? 9;
}

function rel(targetPath) {
  const root = pathFromRoot();
  return String(targetPath).startsWith(root + "/") ? String(targetPath).slice(root.length + 1) : targetPath;
}

function output(result, label) {
  if (json) printResult(result, true, label);
  if (result.ok) {
    console.log(`ok   ${label}`);
  } else {
    console.log(`fail ${label}: ${(result.findings || []).join("; ")}`);
  }
  console.log(`Project: ${projectRoot}`);
  if (result.summary) console.log(`Checks: ${result.summary.enabled}/${result.summary.count} enabled`);
  for (const item of result.checks || []) console.log(`- ${item.enabled === false ? "off" : "on "} ${item.id} [${item.tier}] ${item.command}`);
  for (const item of result.results || []) console.log(`- ${item.ok ? "ok" : "fail"} ${item.id}: ${item.reason}`);
  if (result.warnings?.length) {
    console.log("Warnings:");
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }
  if (result.next?.length) {
    console.log("Next:");
    for (const step of result.next) console.log(`- ${step}`);
  }
  process.exit(result.ok ? 0 : 1);
}
