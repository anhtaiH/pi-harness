import { readFileSync } from "node:fs";
import { pathFromRoot } from "./lib/harness-state.mjs";

const files = {
  "bin/pi-harness": readFileSync(pathFromRoot("bin", "pi-harness"), "utf8"),
  "scripts/bootstrap.mjs": readFileSync(pathFromRoot("scripts", "bootstrap.mjs"), "utf8"),
  "scripts/doctor.mjs": readFileSync(pathFromRoot("scripts", "doctor.mjs"), "utf8"),
};

const checks = [
  { id: "pi-harness-local", ok: files["bin/pi-harness"].includes('node_modules/.bin/pi') && files["bin/pi-harness"].includes('PI_BIN') },
  { id: "pi-harness-sidecar", ok: files["bin/pi-harness"].includes('PI_HARNESS_PROJECT_ROOT') && files["bin/pi-harness"].includes('PI_HARNESS_ROOT') },
  { id: "bootstrap-local", ok: files["scripts/bootstrap.mjs"].includes('node_modules", ".bin", "pi"') && files["scripts/bootstrap.mjs"].includes('(global)') },
  { id: "doctor-local", ok: files["scripts/doctor.mjs"].includes('piBinary()') && files["scripts/doctor.mjs"].includes('local') },
];
const findings = checks.filter((check) => !check.ok).map((check) => check.id);
const ok = findings.length === 0;
console.log(JSON.stringify({ ok, checks, findings }, null, 2));
process.exit(ok ? 0 : 1);
