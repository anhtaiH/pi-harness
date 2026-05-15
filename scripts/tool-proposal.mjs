import { hasFlag, nowIso, parseFlag, pathFromRoot, printResult, slug, timestampId, writeJson } from "./lib/harness-state.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0] || "create";
const json = hasFlag(args, "--json");

if (command !== "create") {
  console.error("usage: node scripts/tool-proposal.mjs create --name name --summary text [--kind script|extension-tool] [--json]");
  process.exit(2);
}

const name = parseFlag(args, "--name", "");
const summary = parseFlag(args, "--summary", "");
const kind = parseFlag(args, "--kind", "script");
if (!name || !summary) printResult({ ok: false, findings: ["missing --name or --summary"] }, json, "tool proposal");

const id = `${slug(name)}-${timestampId()}`;
const dir = pathFromRoot("state", "tool-proposals", id);
const proposal = {
  id,
  name,
  summary,
  kind,
  createdAt: nowIso(),
  status: "proposed",
  requiredReview: ["source review", "unit or smoke test", "secret/path scan", "manual approval before promotion"],
};
writeJson(join(dir, "proposal.json"), proposal);
writeFileSync(join(dir, "proposal.md"), renderProposal(proposal), "utf8");
printResult({ ok: true, proposal, path: join(dir, "proposal.md"), findings: [] }, json, "tool proposal");

function renderProposal(proposal) {
  return [
    `# Tool Proposal: ${proposal.name}`,
    "",
    `- ID: ${proposal.id}`,
    `- Kind: ${proposal.kind}`,
    `- Status: ${proposal.status}`,
    `- Created: ${proposal.createdAt}`,
    "",
    "## Summary",
    "",
    proposal.summary,
    "",
    "## Promotion Checklist",
    "",
    "- Source review completed.",
    "- Tests or smoke checks added.",
    "- Secret/path scan passed.",
    "- Tool description and parameters reviewed for prompt-injection/tool-poisoning risk.",
    "- Explicit approval recorded before adding to `.pi/extensions` or package settings.",
    "",
  ].join("\n");
}
