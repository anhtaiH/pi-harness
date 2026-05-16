import { hasFlag, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const json = hasFlag(args, "--json");
const text = args.filter((arg) => !arg.startsWith("--")).join(" ").trim();
const routes = route(text);
const result = { ok: true, command: "route", query: text, routes, next: routes.map((item) => item.command), findings: [] };

if (json) printResult(result, true, "harness route");
printHuman(result);

function route(input) {
  const value = input.toLowerCase();
  const matches = [];
  add(matches, /research|web|internet|docs?|look up|source|cite|mcp/, "research", "Research / docs lookup", "ph research", "Use read-only, source-cited research first; external writes remain gated.");
  add(matches, /local|ollama|lm studio|offline|cheap|scout|summar(y|ize)/, "local-llm", "Local scout", "ph local-llm", "Good for scouting, summaries, docs cleanup, and check triage; not default for risky edits.");
  add(matches, /scope|brief|plan|grill|unclear|vague|don't know|dont know/, "brief", "Task shaping", "ph brief", "Ask targeted questions, create a task packet, and suggest verification before edits.");
  add(matches, /login|auth|model|provider|api key|no model|no api key/, "models", "Models and login", "ph models", "Use Pi /login and /model; the harness does not read or print credentials.");
  add(matches, /done|finish|evidence|proof|gate|ship/, "done", "Finish safely", "ph done", "Draft evidence, run checks/review policy, and finish gates before done means done.");
  add(matches, /memory|remember|forget|stale|why do you remember/, "memory", "Memory review", "ph memory review", "Review, source, expire, or forget persistent memory. Never store secrets.");
  add(matches, /review|fresh|second opinion|risk|red|yellow/, "review", "Fresh-context review", "ph review-policy explain", "Yellow/red work should consider fresh review before finish.");
  add(matches, /reset|retry|start over|uninstall|repair|broken/, "reset", "Reset / repair", "ph reset", "Preview what would be removed; apply only deletes local harness sidecar state, not project files.");
  if (!matches.length) {
    matches.push({ id: "harness", title: "Open command center", command: "ph more", why: "Show plain-language options and choose the safest next step." });
  }
  return matches.slice(0, 4);
}

function add(matches, pattern, id, title, command, why) {
  if (pattern.test(text)) matches.push({ id, title, command, why });
}

function printHuman(result) {
  console.log("Pi Harness Router");
  console.log("=================");
  if (result.query) console.log("You said: " + result.query + "\n");
  for (const item of result.routes) {
    console.log(`- ${item.title}`);
    console.log(`  Try: ${item.command}`);
    console.log(`  Why: ${item.why}`);
  }
  console.log("\nInside Pi, you can say this naturally; the harness guidance tells Pi which mode to suggest.");
}
