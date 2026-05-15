import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { hasFlag, pathFromRoot, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "next";
const json = hasFlag(args, "--json");
const runGates = hasFlag(args, "--run-gates");
const allowOpenTasks = hasFlag(args, "--allow-open-tasks");
const allowWriterLock = hasFlag(args, "--allow-writer-lock");

if (command === "learn") {
  const status = loadStatus();
  output({
    ok: true,
    command: "learn",
    summary: compactSummary(status),
    lesson: learningCard(status),
    nextActions: status.nextActions || [],
    findings: [],
  }, "harness learn");
}

if (["next", "status"].includes(command)) {
  const status = loadStatus();
  output({ ok: true, command: "next", summary: compactSummary(status), lesson: learningCard(status), nextActions: status.nextActions || [], findings: [] }, "harness next");
}

if (command === "check") {
  const status = loadStatus();
  const checks = runChecks(fastChecks());
  const findings = checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.reason}`);
  output({
    ok: findings.length === 0,
    command: "check",
    summary: compactSummary(status),
    checks,
    remediation: failedAdvice(checks),
    nextActions: status.nextActions || [],
    findings,
  }, "harness check");
}

if (command === "ready") {
  const status = loadStatus();
  const checks = runChecks([...fastChecks(), ...readinessChecks(), ...(runGates ? [{ id: "gates", command: ["npm", "run", "gates"], timeoutMs: 10 * 60_000 }] : [])]);
  const blockers = readinessBlockers(status, { allowOpenTasks, allowWriterLock });
  const findings = [
    ...checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.reason}`),
    ...blockers,
  ];
  output({
    ok: findings.length === 0,
    command: "ready",
    runGates,
    summary: compactSummary(status),
    checks,
    blockers,
    remediation: [...failedAdvice(checks), ...blockers.map(adviceForBlocker)],
    nextActions: status.nextActions || [],
    findings,
  }, "harness ready");
}

console.error("usage: node scripts/harnessctl.mjs learn|next|check|ready [--run-gates] [--allow-open-tasks] [--allow-writer-lock] [--json]");
process.exit(2);

function loadStatus() {
  const result = spawnSync(process.execPath, ["scripts/status.mjs", "--json"], { cwd: pathFromRoot(), encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) {
    return {
      health: { ok: false, findings: [`status command exited ${result.status}`], openTasks: 0, doneTasks: 0, blockedTasks: 0 },
      tasks: [],
      nextActions: ["Fix status generation before continuing."],
      writerLock: null,
      memory: { count: 0, stale: 0, duplicates: [] },
      policyProfiles: { policyCount: 0, expired: 0, clearOnFinishPending: 0 },
      externalWrites: { open: 0 },
    };
  }
  return JSON.parse(result.stdout || readFileSync(pathFromRoot("state", "status", "latest.json"), "utf8"));
}

function fastChecks() {
  return [
    { id: "secret-scan", command: ["node", "scripts/secret-scan.mjs", "--json"] },
    { id: "tool-policy", command: ["node", "scripts/tool-policy.mjs", "doctor", "--json"] },
    { id: "policy-profile", command: ["node", "scripts/policy-profile.mjs", "doctor", "--json"] },
    { id: "memory", command: ["node", "scripts/memory.mjs", "doctor", "--json"] },
    { id: "package-harness", command: ["node", "scripts/package-harness.mjs", "doctor", "--json"] },
    { id: "package-approval", command: ["node", "scripts/package-approval.mjs", "doctor", "--json"] },
    { id: "mcp-sandbox", command: ["node", "scripts/mcp-sandbox.mjs", "doctor", "--json"] },
  ];
}

function readinessChecks() {
  return [
    { id: "package-provenance", command: ["node", "scripts/package-provenance.mjs", "check", "--json"] },
    { id: "tool-metadata", command: ["node", "scripts/tool-policy.mjs", "metadata", "--json"] },
  ];
}

function runChecks(checks) {
  return checks.map((check) => runCheck(check));
}

function runCheck(check) {
  const result = spawnSync(check.command[0], check.command.slice(1), {
    cwd: pathFromRoot(),
    encoding: "utf8",
    timeout: check.timeoutMs || 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  let parsed = null;
  try {
    parsed = stdout.trim().startsWith("{") ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  const ok = result.status === 0 && (parsed?.ok !== false);
  return {
    id: check.id,
    ok,
    status: result.status,
    reason: ok ? "pass" : parsed?.findings?.join("; ") || stderr.trim() || stdout.trim().slice(0, 240) || `exit ${result.status}`,
    command: check.command.join(" "),
    summary: summarizeParsed(parsed),
    advice: adviceForCheck(check.id),
  };
}

function readinessBlockers(status, options) {
  const blockers = [];
  if (!options.allowOpenTasks && status.health?.openTasks > 0) blockers.push(`${status.health.openTasks} open task(s); finish or pass --allow-open-tasks for a local pilot readiness check.`);
  if (!options.allowWriterLock && status.writerLock?.active) blockers.push(`writer lock active for ${status.writerLock.taskId}; release before full eval/gates.`);
  if (status.externalWrites?.open > 0) blockers.push(`${status.externalWrites.open} open external-write intent(s).`);
  if (status.policyProfiles?.expired > 0) blockers.push(`${status.policyProfiles.expired} expired policy profile(s).`);
  if (status.memory?.stale > 0) blockers.push(`${status.memory.stale} stale memory entr${status.memory.stale === 1 ? "y" : "ies"}.`);
  if ((status.memory?.duplicates || []).length > 0) blockers.push(`${status.memory.duplicates.length} duplicate memory entr${status.memory.duplicates.length === 1 ? "y" : "ies"}.`);
  if (status.latestEval && status.latestEval.ok === false) blockers.push("latest eval failed.");
  return blockers;
}

function compactSummary(status) {
  return {
    health: status.health?.ok ? "ok" : "attention",
    openTasks: status.health?.openTasks ?? 0,
    doneTasks: status.health?.doneTasks ?? 0,
    blockedTasks: status.health?.blockedTasks ?? 0,
    writerLock: status.writerLock?.active ? status.writerLock.taskId : "inactive",
    memory: `${status.memory?.count ?? 0} entries`,
    policyProfiles: status.policyProfiles?.policyCount ?? 0,
    openExternalWrites: status.externalWrites?.open ?? 0,
    latestEval: status.latestEval ? (status.latestEval.ok ? `pass (${status.latestEval.caseCount} cases)` : "fail") : "not run",
  };
}

function summarizeParsed(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  return {
    ok: parsed.ok,
    findings: Array.isArray(parsed.findings) ? parsed.findings.length : 0,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.length : 0,
    count: parsed.count ?? parsed.caseCount ?? parsed.toolCount ?? parsed.policyCount ?? undefined,
  };
}

function learningCard(status) {
  const openTask = (status.tasks || []).find((task) => !["done", "blocked"].includes(task.status));
  const writerActive = status.writerLock?.active;
  const base = {
    model: "brief -> work -> proof -> gate",
    principle: "Do not make the user read a manual before the first useful action. Show the next safe action, explain the local failure, and keep the full docs as reference only.",
    concepts: [
      { name: "brief", harnessTerm: "task packet", meaning: "the written boundary for the work" },
      { name: "trail", harnessTerm: "progress log", meaning: "short checkpoints while work changes" },
      { name: "proof", harnessTerm: "evidence", meaning: "what passed, what failed safely, what risk remains" },
      { name: "gate", harnessTerm: "finish gate", meaning: "the final check before done means done" },
    ],
  };

  if (writerActive) {
    return {
      ...base,
      title: "You are editing under a writer lock",
      youAreHere: `Writer lock is active for ${status.writerLock.taskId}. Finish or release it before broad gates.`,
      runNow: ["npm run harness:next", "# after verification: release the writer lock from Pi or the harness tool"],
      practice: "Watch how readiness blocks while a writer lock is active; this teaches the concurrency rule without a separate doc.",
    };
  }

  if (openTask) {
    return {
      ...base,
      title: "You are inside the task loop",
      youAreHere: `Open task: ${openTask.id}`,
      runNow: ["npm run harness:next", "npm run harness:check", "# when done: ask Pi to write evidence, then run the finish gate"],
      practice: "Make one small change, run the smallest meaningful check, then write evidence while the details are fresh.",
    };
  }

  if (!status.health?.ok) {
    return {
      ...base,
      title: "Clear the local blockers first",
      youAreHere: status.health?.findings?.join("; ") || "status needs attention",
      runNow: ["npm run harness:next", "npm run harness:check", "npm run harness:ready -- --run-gates"],
      practice: "Treat each blocker as a teaching moment: the command should say why it matters and the exact next command to try.",
    };
  }

  return {
    ...base,
    title: "Start with one tiny real task",
    youAreHere: "Harness is locally ready.",
    runNow: ["npm run harness:setup -- --apply", "npm run pi", "/harness-new tiny-doc-or-test-cleanup", "/skill:harness scope it, make the smallest change, run one check, write evidence"],
    practice: "Let the setup wizard handle boilerplate and optional batteries first, then use a small docs or test cleanup so the harness loop becomes muscle memory before risky work.",
  };
}

function adviceForCheck(id) {
  const catalog = {
    "secret-scan": {
      why: "The harness is only useful if it never normalizes leaking credentials.",
      try: "npm run secret:scan",
    },
    "tool-policy": {
      why: "Tool policy blocks unsafe reads, destructive shell commands, and external writes before they happen.",
      try: "npm run tool:policy -- doctor --json",
    },
    "policy-profile": {
      why: "Temporary MCP/subagent permissions should expire instead of becoming quiet global power.",
      try: "npm run policy:profile -- doctor --json",
    },
    memory: {
      why: "Memory should stay sourced, current, and secret-free.",
      try: "npm run memory -- doctor --json",
    },
    "package-harness": {
      why: "Portability depends on shipping the files that define behavior, not private generated state.",
      try: "npm run package:harness -- doctor --json",
    },
    "package-approval": {
      why: "Powerful agent packages need visible human risk acceptance when automated review blocks them.",
      try: "npm run package:approval -- doctor --json",
    },
    "mcp-sandbox": {
      why: "Connector discovery should happen in a sandbox before task-scoped use.",
      try: "npm run mcp:sandbox -- doctor --json",
    },
    "package-provenance": {
      why: "Installed package behavior must match reviewed/vendored provenance.",
      try: "npm run package:provenance -- --json",
    },
    "tool-metadata": {
      why: "Connectors need read-only vs write-like classification before policy can reason about them.",
      try: "npm run tool:policy -- metadata --json",
    },
    gates: {
      why: "Gates catch cross-cutting regressions before the harness claims it is ready.",
      try: "npm run gates",
    },
  };
  return catalog[id] || { why: "This check guards a harness invariant.", try: "npm run harness:check" };
}

function failedAdvice(checks) {
  return checks.filter((check) => !check.ok).map((check) => ({ id: check.id, reason: check.reason, ...check.advice }));
}

function adviceForBlocker(blocker) {
  const text = String(blocker);
  if (text.includes("open task")) {
    return {
      id: "open-tasks",
      reason: text,
      why: "Readiness should not hide unfinished work. This prevents a green rollout with loose ends.",
      try: "npm run harness:next, then finish the task or rerun ready with --allow-open-tasks for a local pilot only.",
    };
  }
  if (text.includes("writer lock")) {
    return {
      id: "writer-lock",
      reason: text,
      why: "Full gates include lock lifecycle checks, and concurrent edits make diffs harder to trust.",
      try: "Release the writer lock after verification, then rerun readiness.",
    };
  }
  if (text.includes("external-write")) {
    return {
      id: "external-writes",
      reason: text,
      why: "Anything written outside the repo needs proof or cancellation before the local task can close.",
      try: "npm run external-write -- doctor --json",
    };
  }
  if (text.includes("expired policy")) {
    return {
      id: "policy-profile-expired",
      reason: text,
      why: "Temporary tool permissions should not linger after the need is gone.",
      try: "npm run policy:profile -- prune --dry-run --json",
    };
  }
  if (text.includes("memory")) {
    return {
      id: "memory-maintenance",
      reason: text,
      why: "Bad memory silently teaches future agents the wrong thing.",
      try: "npm run memory -- prune --all --dry-run --json",
    };
  }
  if (text.includes("eval")) {
    return {
      id: "evals",
      reason: text,
      why: "A recent failed eval means the harness cannot prove its own invariants.",
      try: "Inspect state/evals/latest.json, fix the failing case, then rerun npm run eval.",
    };
  }
  return { id: "readiness-blocker", reason: text, why: "Readiness only goes green when local risk is explicit.", try: "npm run harness:next" };
}

function output(result, label) {
  if (json) printResult(result, true, label);
  if (result.ok) {
    console.log(`ok   ${label}`);
  } else {
    console.log(`fail ${label}: ${result.findings.join("; ")}`);
  }
  console.log(`State: ${result.summary.health}; open tasks: ${result.summary.openTasks}; writer lock: ${result.summary.writerLock}`);
  if (result.lesson) printLesson(result.lesson);
  if (result.checks?.length) {
    console.log("Checks:");
    for (const check of result.checks) {
      console.log(`- ${check.ok ? "ok" : "fail"} ${check.id}${check.ok ? "" : `: ${check.reason}`}`);
    }
  }
  if (result.remediation?.length) {
    console.log("How to clear blockers:");
    for (const item of result.remediation.slice(0, 8)) {
      console.log(`- ${item.id}: ${item.why}`);
      console.log(`  Try: ${item.try}`);
    }
  }
  if (result.nextActions?.length) {
    console.log("Next actions:");
    for (const action of result.nextActions.slice(0, 5)) console.log(`- ${action}`);
  }
  console.log("Just-in-time help:");
  console.log("- Run `npm run harness:setup -- --apply` for setup, models, teams, and research guidance.");
  console.log("- Run `npm run harness:learn` when you want the next safe practice step.");
  console.log("- README.md is the main path; docs/ is reference only when you are stuck.");
  process.exit(result.ok ? 0 : 1);
}

function printLesson(lesson) {
  console.log("Learn by doing:");
  console.log(`- Model: ${lesson.model}`);
  console.log(`- You are here: ${lesson.youAreHere}`);
  console.log(`- Principle: ${lesson.principle}`);
  console.log("Run this next:");
  for (const action of lesson.runNow) console.log(`- ${action}`);
  console.log(`Practice: ${lesson.practice}`);
}
