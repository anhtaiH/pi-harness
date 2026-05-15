import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

function check(label, fn, options = {}) {
  try {
    const result = fn();
    console.log(`ok   ${label}${result ? `: ${result}` : ""}`);
  } catch (error) {
    console.log(`${options.optional ? "warn" : "fail"} ${label}: ${error.message}`);
    if (!options.optional) process.exitCode = 1;
  }
}

check("pi binary", () => `${commandVersion(piBinary(), ["--version"])} (${piBinaryLabel()})`);
check("gemini binary", () => execFileSync("gemini", ["--version"], { encoding: "utf8" }).trim(), { optional: true });
check("project settings", () => existsSync(join(root, ".pi", "settings.json")) || fail("missing .pi/settings.json"));
check("harness extension", () => existsSync(join(root, ".pi", "extensions", "harness", "index.ts")) || fail("missing extension"));
check("harness skill", () => existsSync(join(root, ".pi", "skills", "harness", "SKILL.md")) || fail("missing skill"));
check("state dirs", () => {
  for (const dir of ["state", "state/tasks", "state/sessions", "state/notes", "state/reviews", "state/evals", "state/locks", "state/memory", "state/package-reviews", "state/provenance", "state/policy", "state/status", "state/tool-proposals", "state/traces"]) {
    if (!existsSync(join(root, dir))) fail(`missing ${dir}`);
  }
  return "ready";
});
check("local auth isolation", () => {
  const authPath = join(root, ".pi-agent", "auth.json");
  return existsSync(authPath) ? ".pi-agent/auth.json exists; not reading it" : "no local auth file yet";
});
check("task count", () => {
  const taskRoot = join(root, "state", "tasks");
  const count = readdirSync(taskRoot).filter((name) => existsSync(join(taskRoot, name, "task.json"))).length;
  return `${count}`;
});

function commandVersion(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) fail(result.stderr || result.stdout || `${command} exited ${result.status}`);
  return String(result.stdout || result.stderr).trim() || "available";
}

function piBinary() {
  const local = join(root, "node_modules", ".bin", "pi");
  return existsSync(local) ? local : "pi";
}

function piBinaryLabel() {
  return existsSync(join(root, "node_modules", ".bin", "pi")) ? "local" : "global";
}

function fail(message) {
  throw new Error(message);
}
