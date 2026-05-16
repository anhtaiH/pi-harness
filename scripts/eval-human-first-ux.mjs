import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const tmp = pathFromRoot("state", "tmp", "eval-human-first-ux");
const project = join(tmp, "project");
const home = join(tmp, "home");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(project, { recursive: true });
mkdirSync(home, { recursive: true });
writeFileSync(join(project, "package.json"), JSON.stringify({ name: "human-first-target", version: "0.0.0", scripts: { test: "node -e 0" } }, null, 2) + "\n");

try {
  const start = run(["scripts/start-project.mjs", "--target", project, "--no-install", "--json"], { PI_HARNESS_HOME: home, PI_HARNESS_ROOT: "" }, 120_000);
  const startJson = JSON.parse(start.stdout || "{}");
  const projectFiles = readdirSync(project).sort();
  const more = run(["scripts/harness-more.mjs", "--json"]);
  const moreJson = JSON.parse(more.stdout || "{}");
  const local = run(["scripts/local-llm.mjs", "detect", "--json"]);
  const localJson = JSON.parse(local.stdout || "{}");
  const memory = run(["scripts/memory.mjs", "review", "--json"]);
  const memoryJson = JSON.parse(memory.stdout || "{}");
  const statusline = run(["scripts/harness-more.mjs", "statusline", "--json"]);
  const statuslineJson = JSON.parse(statusline.stdout || "{}");

  const urlPathnameRegression = [
    "scripts/lib/harness-state.mjs",
    "scripts/status.mjs",
    "scripts/secret-scan.mjs",
    "scripts/doctor.mjs",
    "scripts/finish-task.mjs",
    "scripts/evidence-doctor.mjs",
    "scripts/source-review.mjs",
    "scripts/install-reviewed-package.mjs",
    "scripts/eval-writer-lock-lifecycle.mjs",
  ].filter((file) => readFileSync(pathFromRoot(file), "utf8").includes("import.meta.url).pathname"));

  const serializedStart = JSON.stringify(startJson);
  const confusingNextStep = serializedStart.includes("source state/setup") || serializedStart.includes("Source the generated snippet");
  const shimDir = join(tmp, "shim-bin");
  const shim = run(["scripts/install-ph-shim.mjs"], { PI_HARNESS_BIN_DIR: shimDir });
  const shimJson = JSON.parse(shim.stdout || "{}");

  const ok = start.status === 0
    && startJson.ok === true
    && startJson.mode?.projectWrites === false
    && confusingNextStep === false
    && existsSync(join(startJson.sidecarDir || "", "bin", "pi-harness"))
    && projectFiles.join(",") === "package.json"
    && more.status === 0
    && moreJson.cards?.some((card) => card.id === "models")
    && moreJson.cards?.some((card) => card.id === "local-llm")
    && moreJson.cards?.some((card) => card.id === "memory")
    && local.status === 0
    && localJson.detected && typeof localJson.detected.any === "boolean"
    && memory.status === 0
    && Array.isArray(memoryJson.recommendations)
    && shim.status === 0
    && shimJson.ok === true
    && existsSync(join(shimDir, "ph"))
    && statusline.status === 0
    && statuslineJson.cards?.some((card) => card.id === "statusline")
    && urlPathnameRegression.length === 0;

  console.log(JSON.stringify({ ok, startOk: startJson.ok, projectFiles, cards: moreJson.cards?.map((card) => card.id), localAny: localJson.detected?.any, memoryCount: memoryJson.count, shimInstalled: Boolean(shimJson.shim), confusingNextStep, statuslineCards: statuslineJson.cards?.map((card) => card.id), urlPathnameRegression }, null, 2));
  process.exit(ok ? 0 : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function run(command, extraEnv = {}, timeout = 30_000) {
  return spawnSync(process.execPath, command, {
    cwd: pathFromRoot(),
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
}
