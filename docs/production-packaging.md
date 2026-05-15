# Pi Harness Production Packaging Plan

This lab is still isolated. Do not copy it into `~/.agent-harness` or a production checkout without an explicit approved rollout task.

## Package shape

The package boundary is the local Pi harness control plane, not credentials or generated state.

Include candidates:

- `README.md`, `AGENTS.md`, `.gitignore`
- `.pi/APPEND_SYSTEM.md`
- `.pi/extensions/harness/index.ts`
- `.pi/skills/harness/SKILL.md`
- `.pi/agents/harness-reviewer.md`
- `.pi/agents/harness-scout.md`
- `.pi/prompts/`
- `.pi/settings.json`
- `bin/pi-harness`
- `harness.config.json`
- `package-lock.json`
- `package-provenance.lock.json`
- `package-approvals.json`
- `package-reviews/` committed review summaries
- `vendor/manifest.json` and reviewed tarballs under `vendor/npm/`
- `scripts/`
- `evals/`
- `docs/harness-usage-guide.md`
- `docs/followup-rollout-and-pr-readiness.md`
- `docs/connector-metadata.md`
- `.github/workflows/pi-harness-gates.yml` when upstream CI is desired
- `state/**/.gitkeep` placeholders so required generated-state directories exist after clone
- `adapters/` templates and `vendor/README.md` for project-specific and offline setup planning

Always exclude:

- `.pi-agent/`
- `.env*`, `.npmrc`, `.netrc`, SSH keys, token/auth/credential files
- `node_modules/`, `.pi/npm/`
- generated state under `state/sessions`, `state/tasks`, `state/traces`, `state/evals`, `state/tmp`, `state/status`, `state/policy`, and `state/memory` unless a reviewer explicitly wants sanitized fixtures
- extracted package review work directories under `state/package-reviews`; use committed summaries in `package-reviews/` instead

## Local manifest and readiness checks

```bash
npm run harness:bootstrap
npm run harness:next
npm run harness:check -- --json
npm run package:harness -- manifest --json
npm run package:harness -- doctor --json
```

These commands only inspect local state and print summaries. They do not package, copy, upload, install, or write to external systems.

Bootstrap and wrappers prefer the repo-local `node_modules/.bin/pi` installed from the vendored Pi CLI tarball. Source review for `@earendil-works/pi-coding-agent@0.74.0` remains blocked because it is a powerful agent CLI, so production packaging keeps the explicit manual approval, committed review summary, checksum, and provenance checks visible instead of bypassing the policy.

For a stricter pre-rollout check, release any active writer lock and run:

```bash
npm run harness:ready -- --run-gates --json
```

`harness:ready` fails closed on open tasks, active writer locks, open external-write intents, stale memory, expired policy profiles, metadata findings, package-provenance findings, and gate failures unless a reviewer explicitly chooses a local-pilot override flag.

## Promotion requirements

Before production use:

1. Create a dedicated rollout task.
2. Run `npm run harness:ready -- --run-gates --json` and `npm run smoke:live -- all --dry-run --json`.
3. Review package manifest output and connector metadata with `npm run tool:policy -- metadata --json`.
4. Confirm no credential or auth paths are included.
5. Define rollback steps and owner approval.
6. If upstreaming, open a draft PR only.

## Rollback

If a package rollout misbehaves:

1. Disable the project extension/package in the target settings.
2. Clear task-scoped policy profiles with `npm run policy:profile -- clear --task <taskId>`.
3. Re-run the target harness gates.
4. Record proof and residual risk in task evidence.
