import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commandWithArgs, harnessCommand, hasFlag, nowIso, pathFromRoot, readJson } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const area = args.find((arg) => !arg.startsWith("--")) || "all";
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply");
const settings = readJson(pathFromRoot(".pi", "settings.json"), {});
const packages = settings.packages || [];
const vendor = readJson(pathFromRoot("vendor", "manifest.json"), { packages: [] });
const cards = [];

if (area === "all" || area === "models") cards.push(cardModels());
if (area === "all" || area === "team") cards.push(cardTeam());
if (area === "all" || area === "research") cards.push(cardResearch());
if (cards.length === 0) fail("unknown area: " + area);

const artifacts = [];
if (apply) {
  const dir = pathFromRoot("state", "setup", "capabilities");
  mkdirSync(dir, { recursive: true });
  for (const card of cards) {
    const file = join(dir, card.id + "-prompt.md");
    writeFileSync(file, promptFor(card), "utf8");
    artifacts.push(file.replace(pathFromRoot() + "/", ""));
  }
  const latest = { ok: true, generatedAt: nowIso(), area, cards, artifacts };
  writeFileSync(join(dir, "latest.json"), JSON.stringify(latest, null, 2) + "\n", "utf8");
  artifacts.push("state/setup/capabilities/latest.json");
}

const result = { ok: true, generatedAt: nowIso(), area, apply, cards, artifacts, next: nextSteps(), findings: [] };
if (json) console.log(JSON.stringify(result, null, 2));
else printHuman(result);

function cardModels() {
  const providers = [
    ["Anthropic", "ANTHROPIC_API_KEY"],
    ["OpenAI", "OPENAI_API_KEY"],
    ["Google Gemini", "GEMINI_API_KEY"],
    ["OpenRouter", "OPENROUTER_API_KEY"],
    ["Vercel AI Gateway", "AI_GATEWAY_API_KEY"],
    ["Amazon Bedrock", "AWS_PROFILE"]
  ];
  const present = providers.filter((item) => Boolean(process.env[item[1]])).map((item) => item[0]);
  return {
    id: "models",
    title: "Models",
    status: present.length ? "partly configured" : "needs login or environment setup",
    why: "Use Pi subscription login, provider environment variables, or custom providers. The harness reports presence only and never prints secret values.",
    current: { presentProviders: present, localCustomModelsFile: existsSync(pathFromRoot(".pi" + "-agent", "models.json")) },
    doNow: [harnessCommand("pi"), "inside Pi: /login", "inside Pi: /model"],
    prompt: "Help the human choose a default model. Inspect availability through Pi UI only. Do not read local login files or print key material."
  };
}

function cardTeam() {
  return {
    id: "team",
    title: "Agent team",
    status: packageReady("pi-subagents") ? "baked in, opt in" : "not ready",
    why: "Pi core stays skeletal. This harness bakes in reviewed team packages but loads them only when the human opts in for that session.",
    current: { subagents: packageStatus("pi-subagents"), intercom: packageStatus("pi-intercom"), projectAgents: projectAgents() },
    doNow: ["PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 " + harnessCommand("pi"), "inside Pi: /subagents-doctor", "inside Pi: Show me the available subagents."],
    guardrails: ["Use scout and reviewer before worker.", "Use task-scoped policy before live subagent tools.", "Use intercom when child agents need decisions."],
    prompt: "Run subagent diagnostics, list available agents, and propose scout -> planner -> worker -> reviewer for non-trivial work."
  };
}

function cardResearch() {
  return {
    id: "research",
    title: "Research and web",
    status: packageReady("pi-web-access") ? "baked in, opt in" : "not ready",
    why: "Research touches the network, so the harness keeps it reviewed, visible, and opt in.",
    current: { webAccess: packageStatus("pi-web-access"), mcpAdapter: packageStatus("pi-mcp-adapter"), promptWorkflows: packageStatus("pi-prompt-template-model"), projectMcpFile: existsSync(pathFromRoot(".mcp.json")) },
    doNow: ["PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 " + harnessCommand("pi"), "inside Pi: /mcp setup", "inside Pi: /mcp tools", "ask researcher for source-cited docs research after scope is clear"],
    guardrails: ["Prefer official docs.", "Keep MCP proxy-first unless direct tools are necessary.", "Write-like external tools still need intent and proof."],
    prompt: "Inspect research and MCP setup, prefer read-only source-cited research, and keep write-like connectors gated."
  };
}

function packageStatus(name) {
  const spec = packages.find((item) => String(item).includes(name));
  const entry = (vendor.packages || []).find((item) => String(item.spec || "").includes(name));
  const packageName = packageNameFromSpec(spec || name);
  const installed = existsSync(pathFromRoot(".pi", "npm", "node_modules", ...packageName.split("/"), "package.json"));
  return { configured: Boolean(spec), spec: spec || null, vendored: Boolean(entry), installed, review: entry ? entry.sourceReviewVerdict : null };
}

function packageNameFromSpec(spec) {
  const raw = String(spec).replace(/^npm:/, "");
  if (raw.startsWith("@")) {
    const slash = raw.indexOf("/");
    const versionAt = raw.indexOf("@", slash);
    return versionAt === -1 ? raw : raw.slice(0, versionAt);
  }
  const versionAt = raw.lastIndexOf("@");
  return versionAt > 0 ? raw.slice(0, versionAt) : raw;
}

function packageReady(name) {
  const status = packageStatus(name);
  return status.configured && status.vendored;
}

function projectAgents() {
  const dir = pathFromRoot(".pi", "agents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".md")).sort().map((name) => name.replace(/\.md$/, ""));
}

function promptFor(card) {
  return ["# " + card.title, "", card.why, "", "## Current", "", "```json", JSON.stringify(card.current, null, 2), "```", "", "## Do now", "", ...card.doNow.map((item) => "- " + item), "", "## Agent prompt", "", card.prompt, ""].join("\n");
}

function nextSteps() {
  const steps = [];
  if (!apply) steps.push("Write prompt artifacts through setup: " + commandWithArgs(harnessCommand("setup"), "--apply"));
  steps.push("Golden path: " + harnessCommand("setup") + ", then " + harnessCommand("pi"));
  steps.push("Opt into packaged batteries for a session only when needed: PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 " + harnessCommand("pi"));
  return steps;
}

function printHuman(result) {
  console.log("Pi Harness Capability Wizard");
  console.log("============================");
  for (const card of result.cards) {
    console.log(card.title + " - " + card.status);
    console.log("  " + card.why);
    console.log("  Current: " + summarizeCurrent(card));
    console.log("  Do now:");
    for (const item of card.doNow) console.log("  - " + item);
    if (card.guardrails && card.guardrails.length) {
      console.log("  Guardrails:");
      for (const item of card.guardrails) console.log("  - " + item);
    }
  }
  if (result.artifacts.length) {
    console.log("Artifacts:");
    for (const artifact of result.artifacts) console.log("- " + artifact);
  }
  console.log("Next:");
  for (const step of result.next) console.log("- " + step);
}

function summarizeCurrent(card) {
  if (card.id === "models") {
    const providers = card.current.presentProviders.length ? card.current.presentProviders.join(", ") : "no provider environment variables detected";
    return providers + "; custom model file: " + (card.current.localCustomModelsFile ? "present" : "not present");
  }
  if (card.id === "team") {
    return "subagents " + readyWord(card.current.subagents) + ", intercom " + readyWord(card.current.intercom) + ", agents: " + (card.current.projectAgents.join(", ") || "none");
  }
  if (card.id === "research") {
    return "web " + readyWord(card.current.webAccess) + ", MCP " + readyWord(card.current.mcpAdapter) + ", prompts " + readyWord(card.current.promptWorkflows);
  }
  return "see JSON output";
}

function readyWord(status) {
  if (!status || !status.configured || !status.vendored) return "not ready";
  return status.installed ? "ready/cached" : "ready/not cached";
}

function fail(message) {
  const result = { ok: false, findings: [message] };
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.error(message);
  process.exit(2);
}
