# Command Reference

This is a quick lookup. For the workflow, start with the root `README.md` and `npm run harness:learn`. For terms like task packet, evidence, finish gate, writer lock, and external-write intent, read `../explanation/core-concepts.md`.

## Adopt into an existing project

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt -- --apply
npm run harness:setup -- --apply --install
npm run pi
```

The setup command prefers pnpm via Corepack for the sidecar install and falls back to npm when pnpm is unavailable.

## Setup and readiness

```bash
npm run harness:setup
npm run harness:setup -- --apply --install --run-gates
npm run harness:bootstrap
npm run harness:learn
npm run harness:next
npm run harness:check -- --json
npm run harness:ready -- --run-gates
npm run gates
```

Machine-readable forms:

```bash
node scripts/adopt-project.mjs --target /path/to/project --json
node scripts/setup-wizard.mjs --apply --json
node scripts/bootstrap.mjs --json
node scripts/harnessctl.mjs ready --run-gates --json
node scripts/eval-runner.mjs --json
```

## Start Pi

```bash
npm run pi
npm run pi:print -- "Use harness_status and summarize state."
```

Optional reviewed/vendored package batteries are explained by `npm run harness:setup`. To load them for a Pi session after you decide you need them:

```bash
PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 npm run pi
```

Inside Pi, use `/login`, `/model`, `/subagents-doctor`, and `/mcp setup` as needed.

## Tasks and evidence

```bash
npm run task:doctor -- <taskId> --json
npm run evidence:doctor -- <taskId> --json
npm run finish -- <taskId> --json
```

Inside Pi, use:

- `harness_status`
- `harness_create_task`
- `harness_record_progress`
- `harness_write_evidence`
- `harness_finish_task`

## Policy

```bash
npm run tool:policy -- doctor --json
npm run tool:policy -- metadata --json
npm run policy:profile -- list --json
npm run policy:profile -- doctor --json
```

## Packages

```bash
npm run package:review -- npm:<package>@<version>
npm run package:approval -- doctor --json
npm run package:provenance -- --json
npm run package:harness -- doctor --json
npm run package:harness -- manifest --json
```

## Memory

```bash
npm run memory -- search --query "runtime policy"
npm run memory -- doctor --json
npm run memory -- prune --all --dry-run --json
```

## Review lanes

```bash
npm run review:lane -- doctor --task <taskId> --json
```

Inside Pi, use:

- `harness_review_plan_lane`
- `harness_review_run_lane`
- `harness_review_record_finding`
- `harness_review_synthesize`

## External writes

```bash
npm run external-write -- doctor --task <taskId> --json
```

Inside Pi, use:

- `harness_record_external_write_intent`
- `harness_record_external_write_proof`
- `harness_cancel_external_write_intent`

## Local connector fixtures

```bash
npm run mcp:sandbox -- list --json
npm run smoke:live -- all --dry-run --json
```
