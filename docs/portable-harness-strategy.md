# Portable Single-Repo Harness Strategy

Goal: make this harness usable across projects, companies, and machines as a self-contained repository module while keeping private material outside version control.

## Portability principles

1. **Repo owns behavior.** Skills, prompts, extension code, policy scripts, evals, docs, and package locks live in the repo.
2. **Repo owns generated state shape, not generated state.** Commit `.gitkeep` placeholders and ignore run-specific task/session/audit files.
3. **Private material is never portable.** Login state, API keys, connector sessions, local keychains, and per-company secrets stay outside tracked files.
4. **Connectors are pluggable.** The core harness knows how to classify and gate tools; project adapters define which connectors exist.
5. **Policy fails closed.** New packages, MCP tools, subagents, and external writes require review, task-scoped enablement, and evidence.
6. **Bootstrap is one command.** A fresh clone should be able to run local checks after dependency installation from committed locks or reviewed vendored artifacts.

## Recommended repo layout

```text
agent-harness/
  package.json
  package-lock.json
  harness.config.json
  bin/
    pi-harness
    harness-bootstrap
  .pi/
    APPEND_SYSTEM.md
    agents/
    extensions/harness/index.ts
    prompts/
    settings.json
    skills/
  scripts/
  evals/
  docs/
  state/
    tasks/.gitkeep
    sessions/.gitkeep
    reviews/.gitkeep
    memory/.gitkeep
    policy/.gitkeep
    tmp/.gitkeep
  adapters/
    README.md
    example-project.harness.json
  vendor/                 # optional, only if offline or air-gapped installs matter
    README.md
```

For a project repo, use one of two shapes:

### Shape A: harness is the repo

Use this when the harness is its own reusable project. Other work repos launch it via a wrapper that points at the target project.

```bash
/path/to/agent-harness/bin/pi-harness --project /path/to/work-repo
```

Pros: one canonical harness repo. Easy to update and test.

Cons: target projects depend on a local sibling checkout.

### Shape B: harness is vendored into each repo

Use this when you want a repo to contain everything needed for its own agents.

```text
work-repo/
  agent-harness/
    package.json
    .pi/
    scripts/
    docs/
    state/.gitkeep files only
  package.json
```

Pros: most self-contained and easiest to take across companies.

Cons: updates require copying or subtree/submodule/vendor sync.

### Shape C: harness as a package plus project adapter

Use this when several repos share a versioned harness but each repo owns a small adapter.

```text
work-repo/
  harness.project.json
  .pi-project/
    skills/
    prompts/
```

Pros: cleaner upgrades and small project footprint.

Cons: less self-contained unless the package is also vendored or pinned in lockfiles.

## Dependency containment model

### Minimum practical containment

Commit:

- `package.json`
- `package-lock.json`
- `.pi/settings.json`
- `package-provenance.lock.json`
- committed source-review summaries under `package-reviews/`
- reviewed vendored package artifacts under `vendor/` when the package is part of the portable runtime

Bootstrap:

```bash
npm ci
npm run package:provenance
npm run harness:ready -- --json
```

This is portable but still needs registry/network access for first install.

### Strong containment

Add a reviewed vendor directory with package tarballs and a bootstrap script that installs from local files only.

```text
vendor/
  npm/
    earendil-works-pi-coding-agent-0.74.0.tgz
    pi-mcp-adapter-2.6.0.tgz
    pi-subagents-0.24.2.tgz
    typebox-1.1.38.tgz
  manifest.json
package-reviews/
  earendil-works_pi-coding-agent_0.74.0/review.json
  pi-mcp-adapter_2.6.0/review.json
  pi-subagents_0.24.2/review.json
  typebox_1.1.38/review.json
```

Bootstrap should verify checksums before install. The manifest should include package name, version, source URL, checksum, review verdict, and license note.

Tradeoff: stronger portability, but more repository weight and more responsibility for license/security updates.

### Full containment target

The Pi CLI is now pinned as a repo dependency backed by a reviewed vendored artifact and manual approval record, so wrappers should resolve `node_modules/.bin/pi` after `npm ci`. The global `pi` fallback remains only for development recovery.

Clone-and-run flow:

```bash
npm ci
npm run harness:bootstrap
npm run harness:ready -- --run-gates --json
npm run pi
```

Resolved gap: source review for `@earendil-works/pi-coding-agent@0.74.0` remains `blocked` because the CLI package necessarily contains powerful local-agent behavior, but the repo now carries an explicit expiring manual approval, committed review summary, vendored tarball checksum, and package provenance enforcement. This makes the approval visible rather than silently weakening policy.

## Project adapter contract

A project adapter should be a small non-secret file that describes project-local conventions without changing core harness policy.

Example shape:

```json
{
  "name": "example-project",
  "root": "..",
  "riskDefault": "yellow",
  "docs": ["README.md", "docs/architecture.md"],
  "checks": ["npm test", "npm run typecheck"],
  "connectors": {
    "mcp": {
      "profile": "mcp-discovery",
      "metadata": "harness.config.json#toolPolicy.toolMetadata"
    }
  },
  "forbiddenPathNotes": ["private local files", "key material", "user-global agent state"]
}
```

Adapter rules:

- no secrets
- no user-specific absolute paths unless they are clearly local examples
- no global allowlists for MCP/subagents
- connector tools must be explicit and classified as read-only or write-like
- project checks should be commands, not hidden shell scripts that read private material

## Pluggable layers

1. **Core harness**: task lifecycle, evidence, policy, finish gates, evals.
2. **Runtime adapters**: Pi wrapper, optional Gemini/other model wrappers.
3. **Project adapters**: docs, checks, project-specific stop conditions.
4. **Connector adapters**: MCP discovery, direct tool metadata, external-write intent mapping.
5. **Review adapters**: read-only subagents, review lane templates, finding schemas.
6. **Packaging adapters**: online npm install, local vendored tarball install, or company registry install.

Each layer should be testable without live external systems. Live connector smoke should remain opt-in and task-scoped.

## Migration path from this lab

1. Keep this lab as the canonical prototype until gates stay green across real work.
2. Done: add a `harness:bootstrap` script that checks for the Pi CLI, initializes state placeholders, and optionally installs repo-local dependencies when explicitly requested.
3. Done: add a non-secret adapter example under `adapters/`.
4. Decide whether the reusable unit is:
   - a standalone harness repo,
   - a vendored `agent-harness/` directory inside each work repo,
   - or a package plus project adapter.
5. If single-repo portability is the top priority, prefer vendored `agent-harness/` plus optional `vendor/` tarballs.
6. For a new company, clone only the harness repo or vendored directory, run bootstrap, then add a new project adapter. Do not carry over company-specific connector config or memory unless it is sanitized and legally portable.

## What should stay local-only

- model login/session files
- connector login/session files
- task history containing company context
- memory entries containing company facts
- package review extraction directories under `state/package-reviews`
- audit logs with operational context
- generated status/eval/trace output unless intentionally sanitized

## Success criteria

A fresh machine can clone the repo and run:

```bash
npm ci
npm run harness:bootstrap
npm run harness:ready -- --json
```

A fully offline machine is the next containment layer: the top-level Pi CLI and optional Pi packages are vendored, but transitive npm dependency installation can still require registry/cache unless the full dependency closure is mirrored in a company registry or vendored cache.

All flows should avoid reading private files, writing to external systems, or depending on user-global agent configuration.
