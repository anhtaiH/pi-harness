# Bootstrap and Adapter UX

This harness should feel safe and obvious on first run. The preferred path is now the setup wizard:

```bash
npm run harness:setup
npm run harness:setup -- --apply --install --run-gates
npm run pi
```

For machine-readable automation, call the scripts directly so npm lifecycle text does not wrap JSON:

```bash
node scripts/setup-wizard.mjs --apply --json
node scripts/bootstrap.mjs --json
node scripts/harnessctl.mjs ready --run-gates --json
```

## What the setup wizard does

`npm run harness:setup` is the agent-driven entry point. Without flags it shows a plan. With `--apply`, it performs safe local setup and writes inspectable artifacts under `state/setup/`.

The wizard follows four phases:

- inspect: show local facts before acting
- apply: run safe local boilerplate when asked
- verify: run fast checks, or full gates with `--run-gates`
- hand off: generate `state/setup/agent-prompt.md` so Pi can continue from a visible prompt

It does not hide risky work. Outside-the-repo writes still require the normal intent and proof flow.

## What bootstrap does

`npm run harness:bootstrap` is an inspect-and-initialize command by default. It:

- checks Node and npm availability
- verifies expected package scripts and lockfile
- creates required local state directories and `.gitkeep` placeholders
- checks for Pi CLI availability without reading login files, preferring the repo-local `node_modules/.bin/pi`
- checks package manifest, connector metadata, package approvals, package provenance, vendored package artifacts, and quick harness health
- prints concise next steps

It does **not** install packages unless you explicitly pass `--install`:

```bash
npm run harness:bootstrap -- --install
```

Use `--offline` only when the full dependency closure is available from local cache or a company mirror. This repo vendors the top-level Pi CLI and optional Pi package tarballs, but `npm ci` can still need registry/cache for transitive npm dependencies.

## Good UX principles

- One obvious entry point: `npm run harness:setup`.
- Idempotent setup: running bootstrap repeatedly should be safe.
- Clear status language: show ready, warning, and blocker states separately.
- No hidden writes: setup defaults to plan mode, and `--apply` shows artifacts and commands.
- Machine-readable mode: every setup command should have JSON output.
- Actionable next steps: every warning should tell the user what to run next.

## Good DX principles

- Commit behavior and contracts, not local run data.
- Keep adapters small, typed-by-convention, and reviewable.
- Keep connector metadata separate from authorization.
- Keep project checks explicit; avoid opaque scripts that hide side effects.
- Keep full gates replayable with `npm run gates`.

## Project adapters

Adapters live under `adapters/` and describe project-specific behavior without weakening core policy.

Start here:

```bash
cp adapters/example-project.harness.json adapters/my-project.harness.json
```

Then edit:

- `name`
- `projectRoot`
- useful docs
- safe local checks
- connector metadata source
- project-specific stop conditions

Adapters must not contain private material, login/session file paths, or global allowlists for MCP/subagents.

## Recommended first-run flow in a new repo

1. Clone or vendor the harness directory.
2. Run `npm run harness:setup` to preview the plan.
3. Run `npm run harness:setup -- --apply --install --run-gates` to let the wizard install, bootstrap, verify, and write a Pi handoff prompt.
4. Inspect `state/setup/agent-prompt.md`.
5. Start Pi with `npm run pi` and ask it to continue from the prompt.
6. Copy `adapters/example-project.harness.json` only when the project needs a custom adapter.
7. Create the first task packet before implementation work.

## Current portability caveat

The repo-local Pi CLI is now pinned through `package.json` to `vendor/npm/earendil-works-pi-coding-agent-0.74.0.tgz`, backed by `package-approvals.json`, `package-reviews/`, and `vendor/manifest.json`. A clean clone should use local Pi after `npm ci`.

Remaining caveat: this is clone-and-run with normal npm dependency installation, not fully offline. Full offline support would require vendoring or mirroring transitive npm dependencies as well.
