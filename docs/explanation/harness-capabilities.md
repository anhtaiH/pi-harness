# Harness Capabilities

This page is not a feature brochure. It is a map of the problems this harness is trying to solve.

Each capability exists because agent work fails in a specific, boring way: vague scope, hidden risk, missing checks, unsafe tools, or summaries nobody can verify.

If a term feels unfamiliar, read [Core Concepts](core-concepts.md) first. This page explains what the harness can do; Core Concepts explains the words.

## Lifecycle and accountability

### Task packets

Plain meaning: a task packet is the written brief for the work. See [Task packet](core-concepts.md#task-packet).

Problem: AI sessions often start with fuzzy intent and then drift.

The harness gives every non-trivial task a packet: goal, scope, risk, desired behavior, verification, and stop conditions.

Daily use:

```text
Create a task packet for fixing the flaky checkout test. Keep the change scoped to test setup unless you find a real product bug.
```

Commands and tools:

- `harness_create_task`
- `harness_task_doctor`
- `state/tasks/<task-id>/packet.md`

### Progress logs

Plain meaning: a progress log is a short trail of useful checkpoints. See [Progress log](core-concepts.md#progress-log).

Problem: the agent learns things while working, but those discoveries vanish into chat.

Progress logs keep short checkpoints. They are not essays. They answer: what changed, what was learned, what is blocked?

Commands and tools:

- `harness_record_progress`
- `state/tasks/<task-id>/progress.md`

### Evidence and finish gates

Plain meaning: evidence is proof of what changed and what was checked. A finish gate is the final harness check before the task is marked done. See [Evidence](core-concepts.md#evidence) and [Finish gate](core-concepts.md#finish-gate).

Problem: final summaries can sound convincing even when checks were skipped.

Evidence forces the agent to say what changed, what passed, what failure mode was checked, what was skipped, and what risk remains.

Finish gates then check the task, evidence, external writes, memory, reviews, package provenance, policy, secrets, writer lock, and evals.

Commands and tools:

- `harness_write_evidence`
- `harness_evidence_doctor`
- `harness_finish_task`
- `npm run finish -- <taskId>`

## Safety and authority

### Runtime tool policy

Plain meaning: runtime policy is the harness checking tool calls while the agent works, not after the fact.

Problem: an agent with tools can read or run things it should not touch.

The harness enforces policy during Pi tool calls. Protected paths are blocked. Risky shell commands are audited or blocked. External-write-like actions need an intent.

Commands and tools:

- `harness_tool_policy_check`
- `npm run tool:policy -- doctor --json`
- `scripts/tool-policy.mjs`

### External-write intent and proof

Plain meaning: before the agent changes something outside the repo, it writes down what it plans to do and how it will prove it happened. See [External-write intent](core-concepts.md#external-write-intent).

Problem: comments, Jira updates, deploys, releases, and PR actions affect other people. They should not happen as a side effect of a chat.

Before an external write, the agent records what it intends to do and how it will verify it. Afterward it records read-back proof. If the write is not performed, the intent is cancelled.

Commands and tools:

- `harness_record_external_write_intent`
- `harness_record_external_write_proof`
- `harness_cancel_external_write_intent`
- `npm run external-write -- doctor --task <taskId> --json`

### One-writer lock

Plain meaning: one agent/session owns file edits at a time. See [Writer lock](core-concepts.md#writer-lock).

Problem: multiple agents or sessions editing at once can create subtle messes.

The writer lock makes implementation ownership explicit. It is simple, local, and intentionally boring.

Commands and tools:

- `harness_writer_lock`
- `npm run writer-lock` if used directly by scripts

### Task-scoped policy profiles

Plain meaning: temporary, narrow permissions for one task. See [Policy profile](core-concepts.md#policy-profile).

Problem: MCP and subagent tools are powerful. Turning them on globally is easy and usually wrong.

Profiles enable narrow access for a task, with expiry and optional cleanup on finish.

Commands and tools:

- `harness_policy_profile`
- `npm run policy:profile -- list --json`
- profiles such as `mcp-discovery`, `subagent-review`, and selected direct MCP tools

## Verification and regression safety

### Gates

Problem: people forget which checks matter.

`npm run gates` runs the core local suite: secret scan, typecheck, doctor, package provenance, and eval replay.

Commands:

```bash
npm run gates
npm run harness:ready -- --run-gates
```

### Evals

Problem: safety behavior can regress while features improve.

The eval suite replays small cases: blocked reads, external-write gating, package provenance, memory behavior, review lanes, bootstrap, dashboard output, and portability.

Commands:

```bash
npm run eval
node scripts/eval-runner.mjs --json
```

### Secret scan

Problem: local harness state can accidentally capture text that should never be committed.

The scanner checks tracked-friendly areas and skips known generated/private directories.

Commands:

```bash
npm run secret:scan
harness_secret_scan
```

### Package provenance

Problem: packages change agent behavior. A package install is not just a dependency update.

The harness records source-review summaries, vendored tarball checksums, manual approvals, and installed package state. Blocked reviews stay blocked unless a valid manual approval exists.

Commands:

```bash
npm run package:review -- npm:<package>@<version>
npm run package:approval -- doctor --json
npm run package:provenance -- --json
```

## Context and review

### Local memory

Problem: agents repeat decisions and rediscover the same rules.

Memory stores durable, sourced, secret-free facts and patterns. It is not a dumping ground for chat transcripts.

Commands:

- `harness_memory_search`
- `harness_memory_add`
- `npm run memory -- doctor --json`

### Review lanes

Problem: serious work benefits from a second pass, but ad hoc review prompts are hard to track.

Review lanes create bounded review prompts and structured findings. They can be dry-run artifacts or live subagent runs when policy allows it.

Commands:

- `harness_review_plan_lane`
- `harness_review_run_lane`
- `harness_review_record_finding`
- `harness_review_synthesize`

### Read-only harness subagents

Problem: subagents are useful, but not every child agent should edit or orchestrate more agents.

The repo includes read-only reviewer/scout agents. They are meant to inspect, summarize, and flag risk.

Files:

- `.pi/agents/harness-reviewer.md`
- `.pi/agents/harness-scout.md`

## Portability and adoption

### Bootstrap

Problem: a harness that only works on one machine is not a harness. It is a local habit.

Bootstrap checks prerequisites, creates local placeholders, verifies repo-local Pi, validates metadata, and reports next steps.

Commands:

```bash
npm run harness:bootstrap
node scripts/bootstrap.mjs --json
```

### Package manifest

Problem: it is easy to accidentally publish local state or forget a required file.

The package manifest lists what belongs in the portable repo and what must stay out.

Commands:

```bash
npm run package:harness -- doctor --json
npm run package:harness -- manifest --json
```

### Project adapters

Problem: every project has its own docs, checks, and connector boundaries.

Adapters describe project-specific behavior without weakening the core harness.

Files:

- `adapters/example-project.harness.json`
- `docs/tutorials/adapt-to-your-repo.md`

### Repo-local Pi

Problem: relying on a global CLI makes clone-and-run brittle.

The repo pins Pi through a vendored tarball and `package.json`. The wrapper prefers `node_modules/.bin/pi` and keeps Pi state isolated to the repo.

Files:

- `bin/pi-harness`
- `vendor/manifest.json`
- `package-approvals.json`

## Connector and extension surface

### MCP sandbox

Problem: connector policy should be tested without hitting real external systems.

The sandbox provides local fixtures for read-only and write-like tool behavior.

Command:

```bash
npm run mcp:sandbox -- list --json
```

### Connector metadata

Problem: tools need classification. Is this read-only? Does it mutate an external system? Who owns it?

Metadata makes that explicit. It is classification, not permission. Policy still controls access.

Command:

```bash
npm run tool:policy -- metadata --json
```

## The honest tradeoff

This harness adds ceremony. A tiny one-line edit may feel slower if you run the full workflow every time.

The payoff shows up when the work is bigger than a prompt: unclear scope, package changes, external systems, review lanes, or code that will actually merge.

Use the harness when the cost of being wrong is higher than the cost of writing down the work.
