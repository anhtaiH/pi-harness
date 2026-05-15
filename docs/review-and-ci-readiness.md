# Review and CI Readiness

This file is the local handoff plan for turning the current harness diff into reviewable pieces. It is not a PR by itself and does not perform external writes.

## Current readiness command

Run this before opening any draft PR or moving the harness into another repo:

```bash
npm run harness:ready -- --run-gates --json
```

Expected shape when ready:

- `ok: true`
- no open tasks
- writer lock inactive
- no open external-write intents
- no expired policy profiles
- memory doctor clean
- package provenance clean
- tool metadata clean
- gates passing

## Suggested review slices

Use small draft PRs or commits in this order. Each slice should pass at least `npm run typecheck` and the relevant targeted evals; the final slice should pass `npm run gates`.

### 1. Baseline local harness lifecycle

Purpose: establish task packets, progress, evidence, finish gates, and writer-lock discipline.

Primary files:

- `.pi/extensions/harness/index.ts`
- `.pi/skills/harness/SKILL.md`
- `scripts/task-doctor.mjs`
- `scripts/evidence-doctor.mjs`
- `scripts/finish-task.mjs`
- `scripts/writer-lock.mjs`
- `scripts/trace-event.mjs`
- task/evidence eval scripts

Review focus:

- task state stays repository-local
- finish gates fail closed
- evidence requirements are explicit and test-covered

### 2. Safety policy and external-write controls

Purpose: enforce private-path blocking, external-write intent/proof flow, and package provenance.

Primary files:

- `scripts/tool-policy.mjs`
- `scripts/external-write.mjs`
- `scripts/secret-scan.mjs`
- `scripts/source-review.mjs`
- `scripts/install-reviewed-package.mjs`
- `scripts/package-provenance.mjs`
- `harness.config.json`
- policy/external-write eval scripts

Review focus:

- runtime policy blocks sensitive reads and risky shell patterns
- documentation text about private material is allowed
- core local harness tools are not falsely classified as external writes
- external systems require intent/proof before finish

### 3. MCP, subagents, and scoped policy profiles

Purpose: keep powerful package surfaces blocked globally while enabling narrow, expiring task-scoped profiles.

Primary files:

- `scripts/policy-profile.mjs`
- `scripts/mcp-sandbox.mjs`
- `scripts/smoke-live.mjs`
- `.pi/agents/harness-reviewer.md`
- `.pi/agents/harness-scout.md`
- `docs/connector-metadata.md`
- policy profile, sandbox, live-smoke, safe-subagent eval scripts

Review focus:

- no wildcard direct MCP allowlists
- profiles expire and clear on finish by default
- read-only agents do not inherit edit/write/MCP tools
- connector metadata classifies behavior but does not authorize access

### 4. Memory and review lanes

Purpose: add sourced local memory/rules and bounded review-lane scaffolding.

Primary files:

- `scripts/memory.mjs`
- `scripts/review-lane.mjs`
- memory/review eval scripts

Review focus:

- memory rejects secret-like text
- import paths stay repository-local
- prune is dry-run friendly
- review findings are structured and synthesize cleanly

### 5. Operator UX, status, packaging, and CI

Purpose: reduce command friction and make packaging/CI handoff explicit.

Primary files:

- `scripts/status.mjs`
- `scripts/harnessctl.mjs`
- `scripts/package-harness.mjs`
- `.github/workflows/pi-harness-gates.yml`
- `package.json`
- `.gitignore`
- `README.md`
- `docs/harness-usage-guide.md`
- `docs/production-packaging.md`
- `docs/review-and-ci-readiness.md`
- `docs/portable-harness-strategy.md`

Review focus:

- `harness:next`, `harness:check`, and `harness:ready` summarize without bypassing gates
- package manifest excludes generated state and private files
- CI runs the same local gates

### 6. Evals as the final regression slice

Purpose: land or update replayable coverage after the implementation slices are readable.

Primary files:

- `evals/001-policy-and-provenance.json`
- `scripts/eval-*.mjs`

Review focus:

- eval count matches expected coverage
- negative tests exercise private-path, policy-profile, external-write, metadata, and writer-lock failure modes
- evals clean up temporary task/policy state

## Local draft PR body

Title: `Draft: Harden and package Pi harness control plane`

Summary:

- Adds repository-local Pi harness lifecycle tools, evidence gates, finish gates, writer lock, and status dashboard.
- Adds runtime tool policy enforcement with private-path blocking, external-write intent/proof flow, package provenance, task-scoped MCP/subagent policy profiles, and connector metadata validation.
- Adds memory/review-lane scaffolding, read-only harness subagents, local MCP sandbox fixtures, operator readiness commands, package manifest checks, and CI gate workflow.
- Documents production packaging, connector metadata, and portable single-repo usage.

Verification:

- `npm run harness:ready -- --run-gates --json`
- `npm run gates`
- `node scripts/eval-runner.mjs --json`
- `npm run smoke:live -- all --dry-run --json`
- `npm run package:harness -- doctor --json`
- `npm run tool:policy -- metadata --json`

Risk and rollback:

- Risk: runtime policy false positives can interrupt local workflow.
- Mitigation: explicit evals cover core harness tools and docs mentioning private material.
- Risk: connector metadata could be mistaken for authorization.
- Mitigation: metadata is inert unless a task-scoped profile allows an exact tool.
- Rollback: disable the project extension/package in target settings, clear task policy profiles, rerun gates, and keep generated state out of the package.

## Do not include in a PR

- local sessions
- local task history unless intentionally sharing sanitized examples
- package review tarball extracts
- local policy audit logs
- local memory entries unless intentionally curated
- private material or user/global harness state
