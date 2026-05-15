# How to Run Gates

Use gates when you need confidence that the harness and the current repo state are healthy.

## Fast check

```bash
npm run harness:check -- --json
```

This runs the quick safety and metadata checks.

## Full readiness

```bash
npm run harness:ready -- --run-gates
```

This is the normal pre-merge or pre-publication check.

## Core gate suite

```bash
npm run gates
```

This runs:

- secret scan
- TypeScript typecheck
- doctor
- package provenance
- eval replay

## Machine-readable output

Prefer direct scripts when you need clean JSON:

```bash
node scripts/harnessctl.mjs ready --run-gates --json
node scripts/eval-runner.mjs --json
node scripts/bootstrap.mjs --json
```

`npm run ... -- --json` can prepend npm lifecycle text. That is fine for humans, annoying for parsers.

## Common failures

### Open task

Finish the task, or use `--allow-open-tasks` only for a local pilot check.

```bash
npm run harness:ready -- --run-gates --allow-open-tasks
```

### Active writer lock

Release the lock before full evals. Some evals need to test the lock lifecycle.

### Failed package provenance

Run:

```bash
npm run package:approval -- doctor --json
npm run package:provenance -- --json
```

Do not install around the failure. Fix the provenance or approval record.

### Failed eval

Read the eval id. Most evals are small and named for the behavior that regressed.

```bash
node scripts/eval-runner.mjs --json
```
