import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { hasFlag, pathFromRoot, printResult } from "./lib/harness-state.mjs";

const args = process.argv.slice(2);
const command = args[0] || "manifest";
const json = hasFlag(args, "--json");

const include = [
  "README.md",
  "AGENTS.md",
  ".gitignore",
  ".pi/APPEND_SYSTEM.md",
  ".pi/extensions/harness/index.ts",
  ".pi/skills/harness/SKILL.md",
  ".pi/agents/harness-reviewer.md",
  ".pi/agents/harness-scout.md",
  ".pi/prompts/harness-start.md",
  ".pi/prompts/harness-finish.md",
  ".pi/settings.json",
  "bin/pi-harness",
  "bin/pi-harness-adopt.mjs",
  "bin/gemini-lab",
  "bin/harness-bootstrap",
  "harness.config.json",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "package-provenance.lock.json",
  "package-approvals.json",
  "package-reviews",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "tsconfig.json",
  "scripts",
  "evals",
  "docs",
  "adapters/README.md",
  "adapters/example-project.harness.json",
  "vendor/README.md",
  "vendor/manifest.json",
  "vendor/npm",
  ".github/workflows/pi-harness-gates.yml",
  "state/evals/.gitkeep",
  "state/locks/.gitkeep",
  "state/memory/.gitkeep",
  "state/notes/.gitkeep",
  "state/package-reviews/.gitkeep",
  "state/policy/.gitkeep",
  "state/provenance/.gitkeep",
  "state/reviews/.gitkeep",
  "state/sessions/.gitkeep",
  "state/setup/.gitkeep",
  "state/status/.gitkeep",
  "state/tasks/.gitkeep",
  "state/tmp/.gitkeep",
  "state/tool-proposals/.gitkeep",
  "state/traces/.gitkeep",
];

const exclude = [
  ".pi-agent",
  ".env*",
  ".npmrc",
  ".netrc",
  ".ssh",
  "node_modules",
  ".pi/npm",
  "state/sessions",
  "state/setup",
  "state/package-reviews",
  "state/tasks",
  "state/traces",
  "state/evals",
  "state/tmp",
  "state/status",
  "state/policy",
  "state/memory",
];

if (command === "manifest") {
  const files = include.map((rel) => {
    const abs = pathFromRoot(rel);
    return { path: rel, exists: existsSync(abs), kind: existsSync(abs) && statSync(abs).isDirectory() ? "directory" : "file" };
  });
  const findings = files.filter((item) => !item.exists).map((item) => `missing package manifest path: ${item.path}`);
  output({ ok: findings.length === 0, mode: "dry-run", include: files, exclude, findings }, "harness package manifest");
}

if (command === "doctor") {
  const findings = [];
  for (const rel of include) {
    if (!existsSync(pathFromRoot(rel))) findings.push(`missing package path: ${rel}`);
  }
  for (const rel of exclude) {
    if (include.includes(rel)) findings.push(`forbidden path included: ${rel}`);
  }
  output({ ok: findings.length === 0, include, exclude, findings }, "harness package doctor");
}

console.error("usage: node scripts/package-harness.mjs manifest|doctor [--json]");
process.exit(2);

function output(result, label) {
  printResult(result, json, label);
}
