import { existsSync } from "node:fs";
import { join } from "node:path";
import { hasFlag, pathFromRoot, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const authFilePresent = existsSync(join(pathFromRoot(), ".pi-agent", "auth.json"));
const profiles = [
  {
    id: "local-scout",
    title: "Local scout",
    useFor: ["summaries", "repo scouting", "docs cleanup", "check triage"],
    avoidFor: ["risky edits", "external writes", "security-sensitive work"],
    command: "ph local-llm",
  },
  {
    id: "cloud-implementation",
    title: "Cloud implementation",
    useFor: ["code edits", "tests", "tool use", "multi-file changes"],
    avoidFor: ["unreviewed red-risk production changes"],
    command: "ph models open, then /login and /model",
  },
  {
    id: "fresh-review",
    title: "Fresh review",
    useFor: ["yellow/red tasks", "security-sensitive changes", "before done on risky work"],
    avoidFor: ["rubber-stamping your own plan"],
    command: "ph review-policy explain",
  },
  {
    id: "cheap-docs",
    title: "Cheap docs cleanup",
    useFor: ["README/docs wording", "summaries", "non-risky copy edits"],
    avoidFor: ["architecture or auth changes without stronger review"],
    command: "ph local-llm or a low-cost cloud model",
  },
];

const result = {
  ok: true,
  command: "models",
  generatedAt: new Date().toISOString(),
  auth: {
    isolatedAuthFilePresent: authFilePresent,
    note: authFilePresent ? "A harness auth file exists; this script does not read it." : "No harness auth file was found; first-run login is probably still needed.",
  },
  profiles,
  next: nextSteps(authFilePresent),
  findings: [],
};

if (json) printResult(result, true, "harness models");
printHuman(result);

function nextSteps(hasAuth) {
  const steps = [];
  if (!hasAuth) steps.push("Run `ph models open`, then type `/login` in Pi and choose a provider.");
  steps.push("After login, type `/model` and pick a cloud implementation model.");
  steps.push("For local scouting, run `ph local-llm` after starting Ollama or LM Studio.");
  steps.push("When a model is selected, run `ph` from your project and type `/harness`.");
  return steps;
}

function printHuman(result) {
  console.log("Pi Harness Models");
  console.log("=================");
  console.log(result.auth.isolatedAuthFilePresent ? "Status: harness auth exists (not read). Use /model to confirm selection." : "Status: no harness login found yet.");
  console.log("");
  console.log("Recommended model profiles:");
  for (const profile of result.profiles) {
    console.log(`- ${profile.title}: ${profile.useFor.join(", ")}`);
    console.log(`  Avoid for: ${profile.avoidFor.join(", ")}`);
    console.log(`  Try: ${profile.command}`);
  }
  console.log("");
  console.log("Next:");
  for (const step of result.next) console.log("- " + step);
  console.log("");
  console.log("The harness never reads or prints your provider credentials. Use Pi's /login and /model screens for that.");
}
