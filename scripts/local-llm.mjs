import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hasFlag, nowIso, pathFromRoot, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "detect";
const json = hasFlag(args, "--json");
const apply = hasFlag(args, "--apply");

if (!["detect", "doctor", "prompt"].includes(command)) {
  printResult({ ok: false, findings: ["usage: node scripts/local-llm.mjs detect|doctor|prompt [--apply] [--json]"] }, json, "local llm");
}

const detected = await detectLocalModels();
const artifacts = [];
if (apply || command === "prompt") artifacts.push(...writeArtifacts(detected));
const result = {
  ok: true,
  command,
  generatedAt: nowIso(),
  detected,
  profiles: localProfiles(),
  suggestedUses: ["summaries", "codebase scouting", "docs cleanup", "test/check triage", "fresh-context review drafts"],
  notDefaultFor: ["risky implementation", "external writes", "security-sensitive changes", "large refactors without cloud/fresh review"],
  next: nextSteps(detected),
  artifacts,
  findings: [],
};

if (json) printResult(result, true, "local llm");
printHuman(result);

async function detectLocalModels() {
  const ollama = await detectOllama();
  const lmStudio = await detectLmStudio();
  return { ollama, lmStudio, any: ollama.available || lmStudio.available };
}

async function detectOllama() {
  const url = "http://localhost:11434/api/tags";
  const response = await getJson(url, 700);
  const models = Array.isArray(response.data?.models) ? response.data.models.map((item) => String(item.name || item.model || "")).filter(Boolean) : [];
  return {
    id: "ollama",
    title: "Ollama",
    available: response.ok,
    baseUrl: "http://localhost:11434/v1",
    tagsUrl: url,
    models,
    error: response.ok ? "" : response.error,
    providerConfig: response.ok ? providerConfig("ollama", "http://localhost:11434/v1", "ollama", models) : null,
  };
}

async function detectLmStudio() {
  const url = "http://localhost:1234/v1/models";
  const response = await getJson(url, 700);
  const models = Array.isArray(response.data?.data) ? response.data.data.map((item) => String(item.id || "")).filter(Boolean) : [];
  return {
    id: "lm-studio",
    title: "LM Studio",
    available: response.ok,
    baseUrl: "http://localhost:1234/v1",
    modelsUrl: url,
    models,
    error: response.ok ? "" : response.error,
    providerConfig: response.ok ? providerConfig("lm-studio", "http://localhost:1234/v1", "lm-studio", models) : null,
  };
}

function providerConfig(name, baseUrl, apiKey, models) {
  return {
    provider: name,
    baseUrl,
    api: "openai-completions",
    apiKey,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    models: models.map((id) => ({ id, name: `${id} (${name})`, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })),
  };
}

async function getJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: error?.name === "AbortError" ? "not responding" : String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

function writeArtifacts(detected) {
  const dir = pathFromRoot("state", "setup", "capabilities");
  mkdirSync(dir, { recursive: true });
  const summaryPath = join(dir, "local-llm.json");
  const promptPath = join(dir, "local-llm-prompt.md");
  writeFileSync(summaryPath, JSON.stringify({ generatedAt: nowIso(), detected }, null, 2) + "\n", "utf8");
  writeFileSync(promptPath, promptText(detected), "utf8");
  return [summaryPath.replace(pathFromRoot() + "/", ""), promptPath.replace(pathFromRoot() + "/", "")];
}

function promptText(detected) {
  return [
    "# Local LLM setup",
    "",
    "Help the human decide whether to use a local model for low-risk harness work.",
    "Do not read or print secrets. Do not make local models the default for risky implementation.",
    "",
    "Detected:",
    "",
    "```json",
    JSON.stringify(detected, null, 2),
    "```",
    "",
    "Suggested policy:",
    "- local model: scouting, summarizing, docs cleanup, check triage",
    "- cloud/tool-capable model: implementation, external writes, security-sensitive changes",
    "- fresh review: before done on yellow/red tasks",
    "",
  ].join("\n");
}

function localProfiles() {
  return [
    {
      id: "local-scout",
      useFor: ["summarize unfamiliar files", "map likely code areas", "draft docs wording", "triage failing check logs"],
      requireHumanBefore: ["editing code", "running external writes", "changing auth/security behavior"],
    },
    {
      id: "cloud-implementation",
      useFor: ["multi-file edits", "tool-heavy debugging", "risky refactors", "shipping work with evidence"],
      requireHumanBefore: ["red-risk changes", "deploy/release/external writes"],
    },
    {
      id: "fresh-review",
      useFor: ["yellow/red review", "security-sensitive changes", "checking done evidence"],
      requireHumanBefore: ["treating review as approval to skip gates"],
    },
  ];
}

function nextSteps(detected) {
  if (detected.any) return ["Open Pi with `ph local-llm`, then use `/harness-local-llm` and `/model`."];
  return [
    "Start Ollama (`ollama serve`) or LM Studio's local server, then rerun `ph local-llm`.",
    "Use local models for cheap scouting/summaries first; keep risky edits on stronger reviewed models.",
  ];
}

function printHuman(result) {
  console.log("Pi Harness Local LLM");
  console.log("====================");
  for (const provider of [result.detected.ollama, result.detected.lmStudio]) {
    console.log(`${provider.available ? "✓" : "-"} ${provider.title}: ${provider.available ? provider.models.length + " model(s)" : provider.error}`);
    for (const model of provider.models.slice(0, 8)) console.log("  - " + model);
  }
  console.log("\nProfiles:");
  for (const profile of result.profiles) {
    console.log(`- ${profile.id}: ${profile.useFor.join(", ")}`);
    console.log(`  Human/stronger model before: ${profile.requireHumanBefore.join(", ")}`);
  }
  console.log("\nGood local uses: " + result.suggestedUses.join(", "));
  console.log("Keep cloud/fresh review for: " + result.notDefaultFor.join(", "));
  console.log("\nNext:");
  for (const step of result.next) console.log("- " + step);
}
