import { existsSync, readFileSync } from "node:fs";
import { harnessCommand, hasFlag, pathFromRoot, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const topic = args.find((arg) => !arg.startsWith("--")) || "all";
const status = readJson(pathFromRoot("state", "status", "latest.json"), null);
const modelStatus = inspectModelStatus();
const cards = allCards().filter((card) => topic === "all" || card.id === topic || card.aliases.includes(topic));
const findings = cards.length ? [] : ["unknown help topic: " + topic];
const result = { ok: findings.length === 0, topic, generatedAt: new Date().toISOString(), cards, next: nextSteps(cards), findings };

if (json) printResult(result, true, "harness more");
if (!result.ok) printResult(result, false, "harness more");
printHuman(result);

function allCards() {
  const ph = shortCommand();
  return [
    {
      id: "start",
      aliases: ["install", "setup", "first-run"],
      title: "Start or reconnect this project",
      summary: "One command connects the current project to a local sidecar, runs useful setup, and keeps project writes off by default.",
      try: ["curl -fsSL https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install | bash", ph + " start"],
      insidePi: ["/harness"],
      guardrails: ["Local sidecar is default.", "Repo mode is explicit; project writes stay off otherwise.", "`ph` shim is installed in a writable PATH directory or you get a direct launcher fallback."],
    },
    {
      id: "models",
      aliases: ["login", "auth", "model"],
      title: "Models, auth, and login",
      summary: modelStatus.authFilePresent ? "A harness auth file exists (not read). Use /model to confirm the selected model or switch profiles." : "No harness login was found. Start with a plain-language /login and /model guide before opening Pi for real work.",
      try: [ph + " models", ph + " models open"],
      insidePi: ["/harness-models", "/login", "/model"],
      guardrails: ["Credentials stay in Pi/provider auth flows.", "Use local scout for low-risk work and a stronger cloud model for implementation.", "Use fresh review for yellow/red risk."],
    },
    {
      id: "local-llm",
      aliases: ["ollama", "lmstudio", "local", "offline"],
      title: "Local LLMs",
      summary: "Detect Ollama or LM Studio and register local models for low-risk scouting, summaries, docs, and check triage.",
      try: [ph + " local-llm", ph + " local-llm detect --json"],
      insidePi: ["/harness-local-llm", "/model"],
      guardrails: ["Profile: local scout/docs/check triage.", "Do not make local models the default for risky implementation unless the human explicitly accepts that risk.", "No API keys are needed for Ollama/LM Studio localhost endpoints."],
    },
    {
      id: "team",
      aliases: ["subagents", "reviewers", "agents"],
      title: "Agent team",
      summary: "Open Pi with reviewed team packages available, then let the harness guide scout/planner/worker/reviewer use.",
      try: [ph + " team"],
      insidePi: ["/harness-team", "/subagents-doctor"],
      guardrails: ["Task-scoped policy remains required for live delegation.", "Use reviewer/scout before worker for non-trivial work."],
    },
    {
      id: "research",
      aliases: ["web", "mcp", "docs"],
      title: "Research, web, and MCP",
      summary: "Open Pi with reviewed research/MCP packages available for source-cited docs lookup and connector discovery.",
      try: [ph + " research"],
      insidePi: ["/harness-research", "/mcp setup", "/mcp tools"],
      guardrails: ["Prefer read-only research first.", "External writes still need intent and read-back proof."],
    },
    {
      id: "brief",
      aliases: ["task", "grill", "scope", "plan"],
      title: "Shape a vague task",
      summary: "Use the built-in brief builder when you do not know the right task boundaries yet.",
      try: [ph + " brief"],
      insidePi: ["/harness-brief"],
      guardrails: ["Ask a few targeted questions before edits.", "Create a task packet with verification before implementation."],
    },
    {
      id: "route",
      aliases: ["intent", "natural", "nl", "what-do-i-say"],
      title: "Natural-language routing",
      summary: "Say what you want in plain English and the harness maps it to models, local LLM, research, task brief, memory, done, review, or reset.",
      try: [ph + " route \"research this with sources\"", ph + " route \"I do not know how to scope this\""],
      insidePi: ["Just ask naturally", "/harness"],
      guardrails: ["Research stays read-only first.", "Task shaping happens before edits.", "External writes still need explicit proof."],
    },
    {
      id: "memory",
      aliases: ["remember", "forget", "rules"],
      title: "Memory safety",
      summary: "Review, search, forget, and prune persistent harness memory so bad or stale rules do not live forever.",
      try: [ph + " memory", ph + " memory review", ph + " memory forget <id> --reason \"stale\""],
      insidePi: ["/harness-memory"],
      guardrails: ["Memory should be sourced, scoped, confidence-rated, and easy to revoke.", "Never save secrets or unsourced guesses."],
    },
    {
      id: "reset",
      aliases: ["repair", "update", "uninstall", "retry", "start-over"],
      title: "Reset, repair, or retry setup",
      summary: "Preview and safely remove only this project's local harness sidecar, repair setup, or rerun the installer update path.",
      try: [ph + " reset", ph + " reset --apply", ph + " repair --apply", ph + " update --apply"],
      insidePi: ["/harness"],
      guardrails: ["Reset previews by default.", "Project files are not removed.", "Full shared-source uninstall is not automatic."],
    },
    {
      id: "statusline",
      aliases: ["footer", "status", "ui"],
      title: "Statusline and next action",
      summary: "The default Pi footer shows task, lock, checks, review, capabilities, memory risk, model, and /harness as the escape hatch.",
      try: [ph + " statusline", ph + " statusline off"],
      insidePi: ["/harness-statusline", "/harness-status"],
      guardrails: ["Keep it compact.", "Use /harness-statusline off if another extension owns the footer."],
    },
  ];
}

function nextSteps(cards) {
  if (!cards.length) return ["Run `" + shortCommand() + " more` to see available topics."];
  if (cards.length === 1) return cards[0].try;
  if (!modelStatus.authFilePresent) return [shortCommand() + " models", shortCommand() + " local-llm", shortCommand() + " route \"I need help getting started\""];
  return [shortCommand(), shortCommand() + " more models", shortCommand() + " brief", shortCommand() + " done"];
}

function printHuman(result) {
  console.log("Pi Harness — what do you need?");
  console.log("==============================");
  if (status?.health) {
    console.log("Today: " + (status.health.ok ? "ready" : "needs attention") + ` · open tasks ${status.health.openTasks} · memory ${status.memory?.count ?? 0}`);
    console.log("");
  }
  console.log("Recommended next action: " + recommendedNextAction());
  console.log("Model/login: " + (modelStatus.authFilePresent ? "found harness auth file (not read)" : "not found yet"));
  console.log("");
  for (const card of result.cards) {
    console.log(card.title);
    console.log("  " + card.summary);
    console.log("  Try: " + card.try.join("  |  "));
    console.log("  Inside Pi: " + card.insidePi.join("  |  "));
    console.log("  Guardrails: " + card.guardrails.join(" "));
    console.log("");
  }
  console.log("Plain English examples: 'research this with sources', 'use a local model to scout', 'grill me to scope this', 'what is blocking done?'");
  console.log("Rule of thumb: if you cannot remember a command, run `ph route \"what I want\"` or open Pi and type /harness.");
}

function inspectModelStatus() {
  const authPath = pathFromRoot(".pi-agent", "auth.json");
  return { authFilePresent: existsSync(authPath) };
}

function recommendedNextAction() {
  if (!modelStatus.authFilePresent) return shortCommand() + " models";
  if (status?.health && !status.health.ok) return shortCommand() + " check";
  if ((status?.health?.openTasks || 0) === 0) return shortCommand() + " brief";
  return shortCommand() + " done";
}

function shortCommand() {
  const command = harnessCommand("pi");
  if (command === "npm run pi") return "npm run pi";
  return "ph";
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}
