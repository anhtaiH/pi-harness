import { spawnSync } from "node:child_process";
import { pathFromRoot } from "./lib/harness-state.mjs";

const manifest = spawnSync(process.execPath, ["scripts/package-harness.mjs", "manifest", "--json"], { cwd: pathFromRoot(), encoding: "utf8" });
const doctor = spawnSync(process.execPath, ["scripts/package-harness.mjs", "doctor", "--json"], { cwd: pathFromRoot(), encoding: "utf8" });
const manifestJson = JSON.parse(manifest.stdout || "{}");
const included = (manifestJson.include || []).map((entry) => entry.path);
const excluded = manifestJson.exclude || [];
const ok = manifest.status === 0
  && doctor.status === 0
  && included.includes(".pi/extensions/harness/index.ts")
  && included.includes(".pi/agents/harness-reviewer.md")
  && included.includes("package-reviews")
  && included.includes("vendor/manifest.json")
  && included.includes("vendor/npm")
  && excluded.includes(".pi-agent")
  && excluded.includes(".env*")
  && excluded.includes("state/sessions");
console.log(JSON.stringify({ ok, includeCount: included.length, excluded, manifestStatus: manifest.status, doctorStatus: doctor.status }, null, 2));
process.exit(ok ? 0 : 1);
