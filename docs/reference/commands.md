# Command Reference

This is a quick lookup. For the workflow, start with the root `README.md` and the `learn` command from your connected harness. For terms like task packet, evidence, finish gate, writer lock, and external-write intent, read `../explanation/core-concepts.md`.

## Start in an existing project

Beginner path, local-only default, no project writes:

```bash
cd your-project
curl -fsSL https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install | bash
ph models
ph
```

Friendly start command when you already have a harness checkout/source:

```bash
/path/to/pi-harness/bin/pi-harness start
```

Compatibility/automation path:

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness start
pi-harness-adopt --apply      # older alias, still supported
```

Repo-contained optional mode:

```bash
/path/to/pi-harness/bin/pi-harness start --mode repo
npm run harness:setup -- --apply --install
npm run pi
```

The setup command prefers pnpm via Corepack for the harness install and falls back to npm when pnpm is unavailable.

## Setup and readiness

Local mode:

```bash
/path/to/local/pi-harness/.../bin/pi-harness start
/path/to/local/pi-harness/.../bin/pi-harness setup
/path/to/local/pi-harness/.../bin/pi-harness setup --interactive
/path/to/local/pi-harness/.../bin/pi-harness setup --apply --install --run-gates
/path/to/local/pi-harness/.../bin/pi-harness bootstrap
/path/to/local/pi-harness/.../bin/pi-harness learn
/path/to/local/pi-harness/.../bin/pi-harness next
/path/to/local/pi-harness/.../bin/pi-harness check --json
/path/to/local/pi-harness/.../bin/pi-harness checks detect --apply --profile standard
/path/to/local/pi-harness/.../bin/pi-harness checks run --profile quick
/path/to/local/pi-harness/.../bin/pi-harness done
/path/to/local/pi-harness/.../bin/pi-harness proof --task <taskId>
/path/to/local/pi-harness/.../bin/pi-harness more
/path/to/local/pi-harness/.../bin/pi-harness models
/path/to/local/pi-harness/.../bin/pi-harness models open
/path/to/local/pi-harness/.../bin/pi-harness route "research this with sources"
/path/to/local/pi-harness/.../bin/pi-harness reset
/path/to/local/pi-harness/.../bin/pi-harness smoke --skip-install
/path/to/local/pi-harness/.../bin/pi-harness local-llm detect --json
/path/to/local/pi-harness/.../bin/pi-harness team
/path/to/local/pi-harness/.../bin/pi-harness research
/path/to/local/pi-harness/.../bin/pi-harness memory review
/path/to/local/pi-harness/.../bin/pi-harness run-long "large migration"
/path/to/local/pi-harness/.../bin/pi-harness run-long-checkpoint <id> --note "safe checkpoint"
/path/to/local/pi-harness/.../bin/pi-harness ready --run-gates
/path/to/local/pi-harness/.../bin/pi-harness gates
```

Repo mode or harness source checkout:

```bash
npm run harness:start
npm run harness:setup
npm run harness:setup -- --apply --install --run-gates
npm run harness:bootstrap
npm run harness:learn
npm run harness:next
npm run harness:check -- --json
npm run harness:checks -- detect --apply
npm run harness:more
npm run harness:local-llm -- detect --json
npm run harness:done
npm run harness:long-run -- plan "large migration"
npm run harness:ready -- --run-gates
npm run gates
```

Machine-readable forms:

```bash
node scripts/start-project.mjs --target /path/to/project --json
node scripts/start-project.mjs --target /path/to/project --dry-run --json
node scripts/adopt-project.mjs --target /path/to/project --json
node scripts/adopt-project.mjs --target /path/to/project --mode repo --json
node scripts/setup-wizard.mjs --interactive
node scripts/setup-wizard.mjs --apply --alias ph --json
node scripts/setup-wizard.mjs --answers-json '{"apply":true,"alias":"ph","projectChecks":true}' --json
node scripts/bootstrap.mjs --json
node scripts/resolve-harness.mjs --cwd /path/to/project --json
node scripts/project-checks.mjs detect --apply --profile standard --json
node scripts/project-checks.mjs run --profile quick --json
node scripts/done-task.mjs --task <taskId> --json
node scripts/proof-ledger.mjs doctor --task <taskId> --json
node scripts/harness-more.mjs --json
node scripts/model-onboarding.mjs --json
node scripts/intent-router.mjs "research this" --json
node scripts/first-run-smoke.mjs --skip-install --json
node scripts/local-llm.mjs detect --json
node scripts/memory.mjs review --json
node scripts/memory.mjs forget <id> --reason "stale" --json
node scripts/long-run.mjs plan "large migration" --json
node scripts/long-run.mjs checkpoint <id> --note "safe checkpoint" --json
node scripts/harnessctl.mjs ready --run-gates --json
node scripts/eval-runner.mjs --json
```

## Start Pi

```bash
/path/to/local/pi-harness/.../bin/pi-harness
/path/to/local/pi-harness/.../bin/pi-harness -p "Use harness_status and summarize state."
# repo mode:
npm run pi
npm run pi:print -- "Use harness_status and summarize state."
```

Optional reviewed/vendored package batteries are explained just in time:

```bash
ph models      # terminal /login + /model guide
ph models open # open Pi for /login and /model
ph route "research this with sources"
ph reset       # preview safe reset/retry
ph local-llm   # Ollama / LM Studio detection and guidance
ph team        # opens Pi with team/subagent packages available
ph research    # opens Pi with research/MCP packages available
```

Inside Pi, use `/harness`, `/harness-models`, `/harness-local-llm`, `/harness-team`, `/harness-research`, `/login`, `/model`, `/subagents-doctor`, and `/mcp setup` as needed.

## Tasks and evidence

```bash
npm run harness:done -- --task <taskId> --json
npm run harness:proof -- doctor --task <taskId> --json
npm run task:doctor -- <taskId> --json
npm run evidence:doctor -- <taskId> --json
npm run finish -- <taskId> --json
```

Inside Pi, use:

- `/harness`
- `/harness-brief`
- `/harness-done`
- `harness_status`
- `harness_create_task`
- `harness_record_progress`
- `harness_done_task`
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
npm run memory -- review --json
npm run memory -- search --query "runtime policy"
npm run memory -- forget <id> --reason "stale or wrong" --json
npm run memory -- doctor --json
npm run memory -- prune --all --dry-run --json
```

## Project checks

```bash
npm run harness:checks -- detect --apply --profile standard --json
npm run harness:checks -- list --json
npm run harness:checks -- run --profile quick --json
npm run harness:review-policy -- plan --task <taskId> --apply --json
npm run harness:review-policy -- doctor --task <taskId> --json
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
