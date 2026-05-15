import { hasFlag, parseFlag, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "list";
const json = hasFlag(args, "--json");

const tools = [
  {
    name: "sandbox_docs_search",
    server: "sandbox",
    readOnly: true,
    externalWrite: false,
    description: "Search local mock Pi harness docs.",
  },
  {
    name: "sandbox_status",
    server: "sandbox",
    readOnly: true,
    externalWrite: false,
    description: "Return mock sandbox status.",
  },
  {
    name: "sandbox_issue_comment",
    server: "sandbox",
    readOnly: false,
    externalWrite: true,
    description: "Mock write-like issue comment; policy should require an external-write intent before use.",
  },
];

if (command === "list" || command === "discover") {
  output({ ok: true, serverCount: 1, toolCount: tools.length, tools, findings: [] }, "mcp sandbox list");
}

if (command === "call") {
  const tool = parseFlag(args, "--tool", "");
  const query = parseFlag(args, "--query", "");
  const found = tools.find((entry) => entry.name === tool);
  if (!found) printResult({ ok: false, findings: [`unknown sandbox tool: ${tool}`] }, json, "mcp sandbox call");
  if (found.externalWrite) {
    output({ ok: false, tool, blockedBySandbox: true, reason: "sandbox write-like tools are metadata fixtures only; use tool-policy to verify intent gating", findings: ["write-like sandbox tool was not executed"] }, "mcp sandbox call");
  }
  const result = tool === "sandbox_status"
    ? { status: "ok", servers: 1, tools: tools.length }
    : { matches: [{ title: "Pi harness policy profiles", snippet: `Mock result for ${query || "policy"}: task-scoped MCP/subagent profiles stay local and narrow.` }] };
  output({ ok: true, tool, readOnly: true, result, findings: [] }, "mcp sandbox call");
}

if (command === "doctor") {
  const findings = [];
  if (!tools.some((tool) => tool.readOnly)) findings.push("sandbox has no read-only tool");
  if (!tools.some((tool) => tool.externalWrite)) findings.push("sandbox has no write-like metadata fixture");
  output({ ok: findings.length === 0, tools, findings }, "mcp sandbox doctor");
}

console.error("usage: node scripts/mcp-sandbox.mjs list|call|doctor [--tool name --query text] [--json]");
process.exit(2);

function output(result, label) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (!result.ok) printResult(result, json, label);
  if (result.tools) console.log(`${label}: ${result.toolCount ?? result.tools.length} tools`);
  else console.log(`ok   ${label}`);
  process.exit(0);
}
