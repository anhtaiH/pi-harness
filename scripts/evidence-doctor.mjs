import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2);
const json = args.includes("--json");
const taskId = args.find((arg) => !arg.startsWith("--"));

if (!taskId) {
  exitWith({ ok: false, findings: ["usage: node scripts/evidence-doctor.mjs <taskId> [--json]"] }, 2);
}

const evidenceFile = join(root, "state", "tasks", taskId, "evidence.md");
const findings = [];

if (!existsSync(evidenceFile)) {
  findings.push(`missing evidence file: ${evidenceFile}`);
} else {
  findings.push(...validateEvidence(readFileSync(evidenceFile, "utf8")));
}

exitWith({ ok: findings.length === 0, taskId, evidenceFile, findings }, findings.length === 0 ? 0 : 1);

function validateEvidence(text) {
  const failures = [];
  const summary = section(text, "Summary");
  const positive = section(text, "Positive Proof");
  const negative = section(text, "Negative Proof");
  const commands = section(text, "Commands Run");
  const skipped = section(text, "Skipped Checks");
  const risk = section(text, "Diff Risk Notes");
  const memory = section(text, "Memory Candidates");

  if (!summary) failures.push("missing Summary content");

  if (!positive) {
    failures.push("missing Positive Proof content");
  } else {
    requireField(failures, positive, "Command or inspection", "Positive Proof");
    requireField(failures, positive, "Result", "Positive Proof");
  }

  if (!negative) {
    failures.push("missing Negative Proof content");
  } else {
    const hasCheck = hasFilledField(negative, "Regression or failure-mode check") || hasFilledField(negative, "Command or inspection");
    if (!hasCheck) failures.push("Negative Proof needs a filled regression/failure-mode check");
    requireField(failures, negative, "Result", "Negative Proof");
  }

  if (!commandsHaveContent(commands)) failures.push("Commands Run needs at least one command or inspection");

  if (!skipped) {
    failures.push("missing Skipped Checks content");
  } else {
    for (const label of ["Check", "Reason", "Residual risk"]) requireField(failures, skipped, label, "Skipped Checks");
  }

  if (!risk) {
    failures.push("missing Diff Risk Notes content");
  } else {
    for (const label of ["Risk", "Mitigation"]) requireField(failures, risk, label, "Diff Risk Notes");
  }

  if (!memory) {
    failures.push("missing Memory Candidates content");
  } else {
    for (const label of ["Candidate", "Source", "Confidence"]) requireField(failures, memory, label, "Memory Candidates");
  }

  if (looksLikeSecret(text)) failures.push("evidence contains secret-like text");

  return failures;
}

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

function requireField(failures, block, label, sectionName) {
  if (!hasFilledField(block, label)) failures.push(`${sectionName} needs a filled ${label.toLowerCase()}`);
}

function hasFilledField(block, label) {
  const match = block.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m"));
  if (!match) return false;
  const value = match[1].trim();
  return Boolean(value) && !["TBD", "TODO", "N/A", "none"].includes(value.toLowerCase());
}

function commandsHaveContent(block) {
  if (!block) return false;
  const fenced = block.match(/```(?:text|bash)?\s*([\s\S]*?)```/);
  if (fenced) return Boolean(fenced[1].trim());
  return Boolean(block.trim());
}

function looksLikeSecret(text) {
  return [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    /\bAIza[0-9A-Za-z_-]{20,}\b/,
    /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i,
  ].some((pattern) => pattern.test(text));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exitWith(result, code) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`ok   evidence doctor: ${result.taskId}`);
  } else {
    console.log(`fail evidence doctor: ${result.findings.join("; ")}`);
  }
  process.exit(code);
}
