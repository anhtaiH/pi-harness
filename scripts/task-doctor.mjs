import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { hasFlag, pathFromRoot, printResult, readJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const taskId = args.find((arg) => !arg.startsWith("--"));

if (!taskId) {
  printResult({ ok: false, findings: ["usage: node scripts/task-doctor.mjs <taskId> [--json]"] }, json, "task doctor");
}

const result = validateTask(taskId);
printResult(result, json, "task doctor");

function validateTask(id) {
  const findings = [];
  const taskDir = pathFromRoot("state", "tasks", id);
  const taskJsonPath = join(taskDir, "task.json");
  const packetPath = join(taskDir, "packet.md");
  const progressPath = join(taskDir, "progress.md");

  if (!existsSync(taskDir)) {
    return { ok: false, taskId: id, findings: [`missing task directory: ${relative(pathFromRoot(), taskDir)}`] };
  }

  if (!existsSync(taskJsonPath)) findings.push("missing task.json");
  if (!existsSync(packetPath)) findings.push("missing packet.md");
  if (!existsSync(progressPath)) findings.push("missing progress.md");
  if (findings.length > 0) return { ok: false, taskId: id, findings };

  const task = readJson(taskJsonPath, null);
  if (!task || typeof task !== "object") {
    findings.push("task.json is not a JSON object");
  } else {
    validateTaskJson(findings, task, id, taskDir);
  }

  validatePacket(findings, readFileSync(packetPath, "utf8"));
  validateProgress(findings, readFileSync(progressPath, "utf8"));

  return { ok: findings.length === 0, taskId: id, findings };
}

function validateTaskJson(findings, task, id, taskDir) {
  if (task.id !== id) findings.push(`task.json id mismatch: ${task.id || "<missing>"} != ${id}`);
  for (const field of ["title", "goal", "createdAt", "updatedAt", "root"]) {
    if (!filled(task[field])) findings.push(`task.json missing ${field}`);
  }
  if (!["green", "yellow", "red"].includes(task.risk)) findings.push("task.json risk must be green, yellow, or red");
  if (task.status && !["started", "in-progress", "blocked", "verifying", "done", "open"].includes(task.status)) {
    findings.push(`task.json has unknown status: ${task.status}`);
  }
  if (task.status === "done" && !filled(task.finishedAt)) findings.push("done task is missing finishedAt");
  if (!task.paths || typeof task.paths !== "object") {
    findings.push("task.json missing paths object");
    return;
  }
  const expected = {
    dir: taskDir,
    packet: join(taskDir, "packet.md"),
    progress: join(taskDir, "progress.md"),
    evidence: join(taskDir, "evidence.md"),
    taskJson: join(taskDir, "task.json"),
  };
  for (const [key, expectedPath] of Object.entries(expected)) {
    if (!filled(task.paths[key])) {
      findings.push(`task.json paths.${key} missing`);
      continue;
    }
    if (resolve(task.paths[key]) !== resolve(expectedPath)) {
      findings.push(`task.json paths.${key} should be ${relative(pathFromRoot(), expectedPath)}`);
    }
  }
}

function validatePacket(findings, text) {
  for (const heading of ["Goal", "Workspace", "Risk", "Scope", "Current State", "Desired Behavior", "Verification", "Stop Conditions"]) {
    if (!section(text, heading)) findings.push(`packet missing ${heading} section`);
  }

  const scope = section(text, "Scope");
  const desired = section(text, "Desired Behavior");
  const verification = section(text, "Verification");
  const stop = section(text, "Stop Conditions");

  if (/define before editing/i.test(scope)) findings.push("packet Scope still contains placeholder text");
  if (/define exact expected behavior/i.test(desired)) findings.push("packet Desired Behavior still contains placeholder text");
  if (/choose the smallest meaningful checks/i.test(verification)) findings.push("packet Verification still contains placeholder text");
  if (!/Allowed files or areas:/i.test(scope)) findings.push("packet Scope must list allowed files or areas");
  if (!/Forbidden files or areas:/i.test(scope)) findings.push("packet Scope must list forbidden files or areas");
  if (!/Non-goals:/i.test(scope)) findings.push("packet Scope must list non-goals");
  if (!/secrets?/i.test(stop)) findings.push("packet Stop Conditions must mention secrets");
  if (!/production/i.test(stop)) findings.push("packet Stop Conditions must mention production-affecting actions");
  if (!/destructive/i.test(stop)) findings.push("packet Stop Conditions must mention destructive actions");
}

function validateProgress(findings, text) {
  const checkpoints = text.match(/^- \d{4}-\d{2}-\d{2}T[^\s]+ \[(started|in-progress|blocked|verifying|done)\] .+/gm) || [];
  if (checkpoints.length === 0) findings.push("progress.md needs at least one timestamped checkpoint with a valid status");
}

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}
