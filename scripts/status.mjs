import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2);
const json = args.includes("--json");
const quiet = args.includes("--quiet");
const taskRoot = join(root, "state", "tasks");
const statusRoot = join(root, "state", "status");

if (!existsSync(taskRoot)) {
  console.log("No task directory exists yet.");
  process.exit(0);
}

const tasks = readdirSync(taskRoot)
  .map((name) => join(taskRoot, name, "task.json"))
  .filter((path) => existsSync(path))
  .map((path) => readJsonIfExists(path))
  .filter(Boolean)
  .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

const activeTask = readJsonIfExists(join(root, "state", "active-task.json"));
const writerLock = readJsonIfExists(join(root, "state", "locks", "writer-lock.json"));
const memory = memorySummary();
const reviewSummary = reviewsSummary();
const policyProfiles = policyProfileSummary();
const externalWrites = externalWriteSummary();
const latestEval = readJsonIfExists(join(root, "state", "evals", "latest.json"));
const taskRows = tasks.slice(0, 50).map(taskSummary);
const health = healthSummary({ tasks: taskRows, memory, policyProfiles, externalWrites, latestEval, writerLock });

const status = {
  generatedAt: new Date().toISOString(),
  root,
  activeTask,
  health,
  tasks: taskRows,
  packageProvenance: readJsonIfExists(join(root, "package-provenance.lock.json")),
  latestEval,
  writerLock: writerLock ? { ...writerLock, active: isLockActive(writerLock) } : null,
  memory,
  reviews: reviewSummary,
  policyProfiles,
  externalWrites,
};
status.nextActions = nextActions(status);

mkdirSync(statusRoot, { recursive: true });
writeFileSync(join(statusRoot, "latest.json"), `${JSON.stringify(status, null, 2)}\n`, "utf8");
writeFileSync(join(statusRoot, "index.html"), renderHtml(status), "utf8");

if (json) {
  console.log(JSON.stringify(status, null, 2));
} else if (!quiet) {
  printHuman(status);
}

function printHuman(status) {
  console.log(`Pi harness lab tasks: ${tasks.length} (${status.health.openTasks} open, ${status.health.doneTasks} done, ${status.health.blockedTasks} blocked)`);
  for (const task of taskRows.slice(0, 20)) {
    console.log(`- ${task.id} [${task.status}/${task.risk}] ${task.title}`);
  }
  console.log(`Health: ${status.health.ok ? "ok" : "attention"}${status.health.findings.length ? ` (${status.health.findings.join("; ")})` : ""}`);
  console.log(`Active task: ${activeTask?.taskId || "none"}`);
  console.log(`Writer lock: ${status.writerLock?.active ? `active (${status.writerLock.taskId})` : "inactive"}`);
  console.log(`Memory: ${memory.count} entries (${memory.stale} stale, ${memory.duplicates.length} duplicates)`);
  console.log(`Policy profiles: ${policyProfiles.policyCount} task policies (${policyProfiles.expired} expired, ${policyProfiles.clearOnFinishPending} clear-on-finish pending)`);
  console.log(`Open external writes: ${externalWrites.open}`);
  if (status.nextActions.length) {
    console.log("Next actions:");
    for (const action of status.nextActions.slice(0, 5)) console.log(`- ${action}`);
  }
  console.log(`Status JSON: ${join(statusRoot, "latest.json")}`);
  console.log(`Status HTML: ${join(statusRoot, "index.html")}`);
}

function taskSummary(task) {
  return {
    id: task.id,
    title: task.title,
    risk: task.risk,
    status: task.status || "open",
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt || "",
    packet: rel(join(taskRoot, task.id, "packet.md")),
    evidence: existsSync(join(taskRoot, task.id, "evidence.md")) ? rel(join(taskRoot, task.id, "evidence.md")) : "",
    runSummary: existsSync(join(taskRoot, task.id, "run-summary.md")) ? rel(join(taskRoot, task.id, "run-summary.md")) : "",
    policyProfiles: policyProfiles.byTask[task.id]?.profiles || [],
    policyExpiresAt: policyProfiles.byTask[task.id]?.expiresAt || "",
    policyClearOnFinish: Boolean(policyProfiles.byTask[task.id]?.clearOnFinish),
    review: reviewSummary.byTask[task.id] || { lanes: 0, runs: 0, findings: 0 },
    externalWrites: externalWrites.byTask[task.id] || { open: 0, closed: 0 },
  };
}

function nextActions(status) {
  const actions = [];
  const openTasks = status.tasks.filter((task) => !["done", "blocked"].includes(task.status));
  if (status.writerLock?.active) actions.push(`Finish or release writer lock for ${status.writerLock.taskId} before full eval/gates.`);
  if (status.externalWrites.open > 0) actions.push("Close open external-write intents with proof or cancellation before finishing tasks.");
  if (status.policyProfiles.expired > 0 || status.policyProfiles.clearOnFinishPending > 0) actions.push("Run `npm run policy:profile -- prune --dry-run --json`, then prune stale/done task policies if expected.");
  if (status.memory.stale > 0 || status.memory.duplicates.length > 0) actions.push("Run `npm run memory -- prune --all --dry-run --json` and remove stale/duplicate memory only after review.");
  if (status.latestEval && status.latestEval.ok === false) actions.push("Inspect `state/evals/latest.json`, fix failing evals, then rerun `npm run eval`.");
  if (openTasks.length > 0) actions.push(`Continue or finish open task ${openTasks[0].id}; write evidence before claiming done.`);
  if (actions.length === 0) actions.push("Harness looks locally ready; for rollout use a dedicated task and run `npm run harness:ready -- --run-gates`.");
  return actions;
}

function healthSummary({ tasks, memory, policyProfiles, externalWrites, latestEval, writerLock }) {
  const openTasks = tasks.filter((task) => !["done", "blocked"].includes(task.status)).length;
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const findings = [];
  if (openTasks > 0) findings.push(`${openTasks} open task(s)`);
  if (blockedTasks > 0) findings.push(`${blockedTasks} blocked task(s)`);
  if (externalWrites.open > 0) findings.push(`${externalWrites.open} open external-write intent(s)`);
  if (memory.stale > 0) findings.push(`${memory.stale} stale memory entr${memory.stale === 1 ? "y" : "ies"}`);
  if (memory.duplicates.length > 0) findings.push(`${memory.duplicates.length} duplicate memory entr${memory.duplicates.length === 1 ? "y" : "ies"}`);
  if (policyProfiles.expired > 0) findings.push(`${policyProfiles.expired} expired policy profile(s)`);
  if (latestEval && latestEval.ok === false) findings.push("latest eval failed");
  if (isLockActive(writerLock)) findings.push(`writer lock active for ${writerLock.taskId}`);
  return { ok: findings.length === 0, openTasks, doneTasks, blockedTasks, findings };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { parseError: String(error.message || error), path: rel(path) };
  }
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function memorySummary() {
  const entries = readJsonl(join(root, "state", "memory", "entries.jsonl"));
  const stale = entries.filter((entry) => entry.expiresAt && Date.parse(entry.expiresAt) < Date.now()).length;
  const byKind = {};
  for (const entry of entries) byKind[entry.kind || "unknown"] = (byKind[entry.kind || "unknown"] || 0) + 1;
  return { count: entries.length, stale, duplicates: duplicateMemory(entries), byKind };
}

function duplicateMemory(entries) {
  const seen = new Map();
  const duplicates = [];
  for (const entry of entries) {
    const key = String(entry.text || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) duplicates.push({ id: entry.id, duplicateOf: seen.get(key) });
    else seen.set(key, entry.id);
  }
  return duplicates;
}

function reviewsSummary() {
  const reviewRoot = join(root, "state", "reviews");
  const byTask = {};
  if (!existsSync(reviewRoot)) return { taskCount: 0, lanes: 0, runs: 0, findings: 0, byTask };
  for (const taskId of readdirSync(reviewRoot)) {
    const dir = join(reviewRoot, taskId);
    const lanes = readJsonl(join(dir, "lanes.jsonl")).length;
    const runs = latestById(readJsonl(join(dir, "runs.jsonl"))).length;
    const findings = readJsonl(join(dir, "findings.jsonl")).length;
    if (lanes || runs || findings) byTask[taskId] = { lanes, runs, findings };
  }
  return {
    taskCount: Object.keys(byTask).length,
    lanes: Object.values(byTask).reduce((sum, item) => sum + item.lanes, 0),
    runs: Object.values(byTask).reduce((sum, item) => sum + item.runs, 0),
    findings: Object.values(byTask).reduce((sum, item) => sum + item.findings, 0),
    byTask,
  };
}

function policyProfileSummary() {
  const byTask = {};
  let expired = 0;
  let clearOnFinishPending = 0;
  for (const task of tasks) {
    const policy = readJsonIfExists(join(taskRoot, task.id, "tool-policy.json"));
    if (!policy) continue;
    const isExpired = Boolean(policy.expiresAt && Date.parse(policy.expiresAt) < Date.now());
    if (isExpired) expired++;
    if (task.status === "done" && policy.clearOnFinish) clearOnFinishPending++;
    byTask[task.id] = {
      profiles: policy.profiles || [],
      selectedTools: policy.selectedTools || [],
      allowlist: policy.allowlist || [],
      riskyTools: policy.riskyTools || [],
      appliedAt: policy.appliedAt || "",
      expiresAt: policy.expiresAt || "",
      clearOnFinish: Boolean(policy.clearOnFinish),
      expired: isExpired,
    };
  }
  return { policyCount: Object.keys(byTask).length, expired, clearOnFinishPending, byTask };
}

function externalWriteSummary() {
  const byTask = {};
  let open = 0;
  let closedTotal = 0;
  for (const task of tasks) {
    const dir = join(taskRoot, task.id);
    const intents = readJsonl(join(dir, "external-write-intents.jsonl"));
    const proofs = readJsonl(join(dir, "external-write-proofs.jsonl"));
    const cancellations = readJsonl(join(dir, "external-write-cancellations.jsonl"));
    const closed = new Set([...proofs, ...cancellations].map((entry) => entry.intentId).filter(Boolean));
    const taskOpen = intents.filter((entry) => !closed.has(entry.id) && (!entry.expiresAt || Date.parse(entry.expiresAt) >= Date.now())).length;
    if (intents.length || closed.size) byTask[task.id] = { open: taskOpen, closed: closed.size, intents: intents.length };
    open += taskOpen;
    closedTotal += closed.size;
  }
  return { open, closed: closedTotal, byTask };
}

function latestById(entries) {
  const byId = new Map();
  for (const entry of entries) byId.set(entry.id, entry);
  return [...byId.values()];
}

function isLockActive(lock) {
  return Boolean(lock && !lock.releasedAt && (!lock.expiresAt || Date.parse(lock.expiresAt) >= Date.now()));
}

function renderHtml(status) {
  const rows = status.tasks.map((task) => `<tr><td><code>${escapeHtml(task.id)}</code></td><td>${badge(task.status)}</td><td>${badge(task.risk)}</td><td>${escapeHtml(task.updatedAt)}</td><td>${escapeHtml(task.title)}</td><td>${links(task)}</td><td>${escapeHtml(task.policyProfiles.join(", ") || "—")}${task.policyExpiresAt ? `<br><small>expires ${escapeHtml(task.policyExpiresAt)}</small>` : ""}</td><td>${task.review.lanes}/${task.review.runs}/${task.review.findings}</td><td>${task.externalWrites.open}</td></tr>`).join("\n");
  const evalStatus = status.latestEval?.ok ? "pass" : status.latestEval ? "fail" : "not run";
  const lockStatus = status.writerLock?.active ? `active for ${status.writerLock.taskId}` : "inactive";
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <title>Pi Harness Lab Status</title>",
    "  <style>body{font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:32px;line-height:1.4;color:#222}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:18px 0}.card{border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa}.card.attention{background:#fff7e6;border-color:#f0c36d}.metric{font-size:24px;font-weight:700}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f6f6f6}code{background:#f6f6f6;padding:2px 4px;border-radius:4px}.badge{display:inline-block;border-radius:999px;background:#eee;padding:1px 7px}a{color:#075db3;text-decoration:none}</style>",
    "</head>",
    "<body>",
    "  <h1>Pi Harness Lab Status</h1>",
    `  <p>Generated: <code>${escapeHtml(status.generatedAt)}</code></p>`,
    `  <p>Active task: <code>${escapeHtml(status.activeTask?.taskId || "none")}</code> | Writer lock: <code>${escapeHtml(lockStatus)}</code></p>`,
    `  <p>Health: <strong>${escapeHtml(status.health.ok ? "ok" : "attention")}</strong>${status.health.findings.length ? ` — ${escapeHtml(status.health.findings.join("; "))}` : ""}</p>`,
    "  <h2>Next actions</h2>",
    `  <ul>${status.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>`,
    "  <div class=\"cards\">",
    card("Open tasks", status.health.openTasks, `${status.health.doneTasks} done`, status.health.openTasks > 0),
    card("Latest eval", evalStatus, `${status.latestEval?.caseCount || 0} cases`, evalStatus === "fail"),
    card("Memory", status.memory.count, `${status.memory.stale} stale / ${status.memory.duplicates.length} dupes`, status.memory.stale > 0 || status.memory.duplicates.length > 0),
    card("Reviews", status.reviews.lanes, `${status.reviews.runs} runs / ${status.reviews.findings} findings`),
    card("Policy profiles", status.policyProfiles.policyCount, `${status.policyProfiles.expired} expired / ${status.policyProfiles.clearOnFinishPending} clear pending`, status.policyProfiles.expired > 0),
    card("External writes", status.externalWrites.open, `${status.externalWrites.closed} closed`, status.externalWrites.open > 0),
    "  </div>",
    "  <h2>Tasks</h2>",
    "  <table>",
    "    <thead><tr><th>Task</th><th>Status</th><th>Risk</th><th>Updated</th><th>Title</th><th>Artifacts</th><th>Policy</th><th>Review lanes/runs/findings</th><th>Open external writes</th></tr></thead>",
    `    <tbody>${rows}</tbody>`,
    "  </table>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function links(task) {
  const items = [];
  if (task.packet) items.push(`<a href=\"../../${escapeHtml(task.packet)}\">packet</a>`);
  if (task.evidence) items.push(`<a href=\"../../${escapeHtml(task.evidence)}\">evidence</a>`);
  if (task.runSummary) items.push(`<a href=\"../../${escapeHtml(task.runSummary)}\">summary</a>`);
  return items.join(" · ") || "—";
}

function card(title, value, subtitle, attention = false) {
  return `    <div class=\"card${attention ? " attention" : ""}\"><div>${escapeHtml(title)}</div><div class=\"metric\">${escapeHtml(value)}</div><div>${escapeHtml(subtitle)}</div></div>`;
}

function badge(value) {
  return `<span class=\"badge\">${escapeHtml(value)}</span>`;
}

function rel(path) {
  return relative(root, path);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}
