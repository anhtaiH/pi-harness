import { readFileSync } from "node:fs";
import { pathFromRoot } from "./lib/harness-state.mjs";

const source = readFileSync(pathFromRoot(".pi", "extensions", "harness", "index.ts"), "utf8");
const checks = [
  ["tool_call hook", /pi\.on\("tool_call"/.test(source)],
  ["policy script bridge", /runJsonScript\("tool-policy\.mjs"/.test(source)],
  ["runtimeEnforcement toggle", /runtimeEnforcement/.test(source)],
  ["policy audit log", /tool-policy-audit\.jsonl/.test(source)],
  ["active task fallback", /readActiveTaskId\(\)/.test(source) && /activeWriterLockTaskId\(\)/.test(source)],
];
const findings = checks.filter(([, ok]) => !ok).map(([label]) => `missing ${label}`);
const result = { ok: findings.length === 0, findings };
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
