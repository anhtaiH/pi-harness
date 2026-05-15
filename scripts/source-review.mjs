import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const json = process.argv.includes("--json");
const specs = args.length ? args : defaultPackageSpecs();

if (specs.length === 0) {
  exitWith({ ok: false, findings: ["no package specs supplied and harness.config.json has no candidatePackages"] }, 2);
}

const lifecycleScriptNames = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepack",
  "prepare",
  "postpack",
  "prepublish",
  "prepublishOnly",
]);

const signalPatterns = [
  [/\bchild_process\b|\bexec(File|Sync)?\b|\bspawn(Sync)?\b/, "process execution"],
  [/\bwriteFile(Sync)?\b|\bappendFile(Sync)?\b|\brm(Sync)?\b|\bunlink(Sync)?\b/, "filesystem mutation"],
  [/\bprocess\.env\b/, "environment access"],
  [/\bhomedir\(|\.ssh|\.npmrc|\.netrc|auth\.json|\.env\b/, "credential path reference"],
  [/\bfetch\(|https?\.request|WebSocket\b/, "network access"],
  [/\bchmod(Sync)?\b|\bchown(Sync)?\b/, "permission mutation"],
  [/\bsecurity find-generic-password\b|Keychain/i, "keychain access"],
];

const reviewRoot = join(root, "state", "package-reviews");
const tarballRoot = join(reviewRoot, "_tarballs");
mkdirSync(tarballRoot, { recursive: true });

const reviews = specs.map(reviewPackage);
writeFileSync(join(reviewRoot, "latest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), reviews }, null, 2)}\n`, "utf8");

const result = {
  ok: reviews.every((review) => review.verdict !== "blocked"),
  reviews,
};
exitWith(result, result.ok ? 0 : 1);

function defaultPackageSpecs() {
  const config = JSON.parse(readFileSync(join(root, "harness.config.json"), "utf8"));
  return (config.candidatePackages || []).map((entry) => entry.source).filter(Boolean);
}

function reviewPackage(spec) {
  const packOutput = execFileSync("npm", ["pack", spec.replace(/^npm:/, ""), "--json", "--pack-destination", tarballRoot], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const packInfo = JSON.parse(packOutput)[0];
  const safeName = safePackageId(`${packInfo.name}@${packInfo.version}`);
  const dir = join(reviewRoot, safeName);
  const extractDir = join(dir, "extracted");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", join(tarballRoot, packInfo.filename), "-C", extractDir], { cwd: root });

  const packageRoot = join(extractDir, "package");
  const packageJsonPath = join(packageRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const signals = scanPackage(packageRoot);
  const lifecycleScripts = Object.entries(packageJson.scripts || {}).filter(([name]) => lifecycleScriptNames.has(name));
  const piResources = discoverPiResources(packageJson, packageRoot);
  const verdict = lifecycleScripts.length > 0 ? "blocked" : "trial-ok-after-source-spot-check";

  const review = {
    spec,
    name: packInfo.name,
    version: packInfo.version,
    tarball: join(tarballRoot, packInfo.filename),
    reviewDir: dir,
    size: packInfo.size,
    unpackedSize: packInfo.unpackedSize,
    fileCount: packInfo.files?.length || 0,
    license: packageJson.license || null,
    bin: packageJson.bin || null,
    scripts: packageJson.scripts || {},
    lifecycleScripts,
    dependencyCount: Object.keys(packageJson.dependencies || {}).length,
    peerDependencyCount: Object.keys(packageJson.peerDependencies || {}).length,
    piResources,
    signals,
    verdict,
    reviewedAt: new Date().toISOString(),
  };

  writeFileSync(join(dir, "review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "review.md"), renderReview(review), "utf8");
  return review;
}

function discoverPiResources(packageJson, packageRoot) {
  const manifest = packageJson.pi || {};
  return {
    manifest,
    conventionDirs: ["extensions", "skills", "prompts", "themes"].filter((name) => existsSync(join(packageRoot, name))),
  };
}

function scanPackage(packageRoot) {
  const signals = [];
  const files = listFiles(packageRoot).filter((file) => isInspectable(file));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const [pattern, label] of signalPatterns) {
      if (pattern.test(text)) {
        signals.push({ file: relative(packageRoot, file), signal: label });
        break;
      }
    }
    if (signals.length >= 80) break;
  }
  return signals;
}

function listFiles(dir) {
  const result = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...listFiles(path));
    if (stat.isFile()) result.push(path);
  }
  return result;
}

function isInspectable(file) {
  const name = basename(file);
  if (statSync(file).size > 512 * 1024) return false;
  return /\.(?:js|mjs|cjs|ts|tsx|sh|json|md|yaml|yml)$/.test(name) || name === "SKILL.md";
}

function renderReview(review) {
  const scriptLines = Object.entries(review.scripts).map(([name, command]) => `- \`${name}\`: \`${command}\``);
  const signalLines = review.signals.map((signal) => `- \`${signal.file}\`: ${signal.signal}`);
  return [
    `# Package Source Review: ${review.name}@${review.version}`,
    "",
    `- Spec: \`${review.spec}\``,
    `- Verdict: \`${review.verdict}\``,
    `- License: ${review.license || "unknown"}`,
    `- Files: ${review.fileCount}`,
    `- Size: ${review.size} bytes packed, ${review.unpackedSize} bytes unpacked`,
    `- Dependencies: ${review.dependencyCount} runtime, ${review.peerDependencyCount} peer`,
    `- Tarball: \`${review.tarball}\``,
    "",
    "## Pi Resources",
    "",
    "```json",
    JSON.stringify(review.piResources, null, 2),
    "```",
    "",
    "## Scripts",
    "",
    scriptLines.length ? scriptLines.join("\n") : "- None.",
    "",
    "## Lifecycle Scripts",
    "",
    review.lifecycleScripts.length ? review.lifecycleScripts.map(([name, command]) => `- \`${name}\`: \`${command}\``).join("\n") : "- None found.",
    "",
    "## Static Signals",
    "",
    signalLines.length ? signalLines.join("\n") : "- No first-pass static signals found.",
    "",
    "## Notes",
    "",
    "- This review uses npm tarball contents and static scanning. It does not prove package safety.",
    "- A Pi package extension still executes arbitrary local code when loaded.",
    "",
  ].join("\n");
}

function safePackageId(value) {
  return value.replace(/^@/, "").replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function exitWith(result, code) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const review of result.reviews || []) {
      console.log(`${review.verdict.padEnd(32)} ${review.name}@${review.version} -> ${relative(root, review.reviewDir)}/review.md`);
    }
    if (result.findings) console.log(result.findings.join("\n"));
  }
  process.exit(code);
}
