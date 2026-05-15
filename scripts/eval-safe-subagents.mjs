import { existsSync, readFileSync } from "node:fs";
import { pathFromRoot } from "./lib/harness-state.mjs";

const files = [".pi/agents/harness-reviewer.md", ".pi/agents/harness-scout.md"];
const findings = [];
const agents = files.map((file) => {
  const path = pathFromRoot(file);
  if (!existsSync(path)) {
    findings.push(`missing ${file}`);
    return { file, exists: false };
  }
  const text = readFileSync(path, "utf8");
  const frontmatter = text.split("---")[1] || "";
  const toolsLine = frontmatter.split(/\r?\n/).find((line) => line.startsWith("tools:")) || "";
  const tools = toolsLine.replace(/^tools:\s*/, "").split(",").map((tool) => tool.trim()).filter(Boolean);
  for (const forbidden of ["edit", "write", "mcp", "subagent"]) {
    if (tools.includes(forbidden)) findings.push(`${file} includes forbidden tool ${forbidden}`);
  }
  if (!tools.includes("read")) findings.push(`${file} should include read`);
  if (!/Do not edit or write files\./.test(text)) findings.push(`${file} missing no-edit rule`);
  return { file, exists: true, tools };
});
const ok = findings.length === 0;
console.log(JSON.stringify({ ok, agents, findings }, null, 2));
process.exit(ok ? 0 : 1);
