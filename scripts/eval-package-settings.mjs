import { readJson, pathFromRoot } from "./lib/harness-state.mjs";

const settings = readJson(pathFromRoot(".pi", "settings.json"), {});
const lock = readJson(pathFromRoot("package-provenance.lock.json"), { packages: [] });
const packages = settings.packages || [];
const lockSpecs = new Set((lock.packages || []).map((entry) => entry.spec));
const findings = [];

if (!Array.isArray(packages) || packages.length === 0) findings.push(".pi/settings.json packages is empty");
for (const spec of packages) {
  if (!String(spec).startsWith("npm:")) findings.push(`${spec} is not an npm package spec`);
  if (!lockSpecs.has(spec)) findings.push(`${spec} missing from package-provenance.lock.json`);
}

console.log(JSON.stringify({ ok: findings.length === 0, packages, findings }, null, 2));
process.exit(findings.length === 0 ? 0 : 1);
