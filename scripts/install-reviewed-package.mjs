import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { validManualApprovalFor } from "./package-approval.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const specs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

if (specs.length === 0) {
  console.error("usage: node scripts/install-reviewed-package.mjs <npm:package@version> [...]");
  process.exit(2);
}

for (const spec of specs) {
  const review = findReview(spec);
  if (!review) {
    console.error(`no source review found for ${spec}; run npm run package:review -- ${spec}`);
    process.exit(1);
  }
  if (review.verdict === "blocked") {
    const approval = validManualApprovalFor(spec, review);
    if (!approval) {
      console.error(`refusing to install ${spec}; source review verdict is blocked and no valid manual approval exists`);
      process.exit(1);
    }
    console.log(`installing manually approved package ${spec} (approval ${approval.id})`);
  } else {
    console.log(`installing reviewed package ${spec}`);
  }
  execFileSync("./bin/pi-harness", ["install", spec, "-l"], { cwd: root, stdio: "inherit" });
}

console.log("installed packages:");
execFileSync("./bin/pi-harness", ["list"], { cwd: root, stdio: "inherit" });
execFileSync("node", ["scripts/package-provenance.mjs", "write"], { cwd: root, stdio: "inherit" });

function findReview(spec) {
  const latest = join(root, "state", "package-reviews", "latest.json");
  if (!existsSync(latest)) return null;
  const data = JSON.parse(readFileSync(latest, "utf8"));
  const normalized = spec.replace(/^npm:/, "");
  return (data.reviews || []).find((review) => review.spec === spec || `${review.name}@${review.version}` === normalized);
}
