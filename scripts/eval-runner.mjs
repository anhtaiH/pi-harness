import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { hasFlag, nowIso, pathFromRoot, printResult, writeJson, appendJsonl } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const caseDir = pathFromRoot("evals");
const resultFile = pathFromRoot("state", "evals", "latest.json");
const traceFile = pathFromRoot("state", "traces", `eval-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.jsonl`);

const cases = loadCases();
const results = cases.map(runCase);
const findings = results.filter((result) => !result.ok).map((result) => `${result.id}: ${result.reason}`);
const summary = { ok: findings.length === 0, generatedAt: nowIso(), caseCount: cases.length, results, findings, traceFile };
writeJson(resultFile, summary);
printResult(summary, json, "eval runner");

function loadCases() {
  if (!existsSync(caseDir)) return [];
  return readdirSync(caseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => {
      const value = JSON.parse(readFileSync(join(caseDir, name), "utf8"));
      return Array.isArray(value) ? value : [value];
    });
}

function runCase(testCase) {
  const startedAt = nowIso();
  const command = testCase.command || [];
  appendJsonl(traceFile, { timestamp: startedAt, type: "eval-start", id: testCase.id, command });
  if (!Array.isArray(command) || command.length === 0) {
    return finish(testCase, startedAt, false, "missing command", null);
  }
  const result = spawnSync(command[0], command.slice(1), {
    cwd: pathFromRoot(),
    encoding: "utf8",
    timeout: testCase.timeoutMs || 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const expectedExit = testCase.expectExit ?? 0;
  let ok = result.status === expectedExit;
  let reason = ok ? "pass" : `expected exit ${expectedExit}, got ${result.status}`;
  for (const needle of testCase.stdoutIncludes || []) {
    if (!stdout.includes(needle)) {
      ok = false;
      reason = `stdout did not include ${JSON.stringify(needle)}`;
      break;
    }
  }
  for (const needle of testCase.stderrIncludes || []) {
    if (!stderr.includes(needle)) {
      ok = false;
      reason = `stderr did not include ${JSON.stringify(needle)}`;
      break;
    }
  }
  return finish(testCase, startedAt, ok, reason, {
    status: result.status,
    signal: result.signal,
    stdout: stdout.slice(0, 4000),
    stderr: stderr.slice(0, 4000),
  });
}

function finish(testCase, startedAt, ok, reason, result) {
  const entry = { id: testCase.id, ok, reason, startedAt, finishedAt: nowIso(), result };
  appendJsonl(traceFile, { timestamp: entry.finishedAt, type: "eval-finish", ...entry });
  return entry;
}
