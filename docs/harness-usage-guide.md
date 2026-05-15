# How To Use This Pi Harness

This lab is a local, portable harness prototype built around Pi. Use it when you want Pi to run with harness skills, prompts, extensions, sessions, task packets, safety checks, and evidence gates instead of your normal global Pi setup. The harness can live outside the project checkout (default local adoption) or inside `.pi-harness/` (repo mode).

## 1. Start Here

Local adoption:

```bash
cd your-project
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt -- --apply
/path/to/local/pi-harness/.../bin/pi-harness setup --apply --install
/path/to/local/pi-harness/.../bin/pi-harness next
/path/to/local/pi-harness/.../bin/pi-harness
```

Harness source checkout or repo mode:

```bash
npm run harness:bootstrap
npm run doctor
npm run gates
npm run harness:next
npm run pi
```

Why use the harness launcher instead of plain `pi`?

- It sets `PI_CODING_AGENT_DIR` to the harness root's `.pi-agent/` directory.
- It saves sessions under `state/sessions/`.
- It loads the harness `.pi/` resources by default.
- It starts Pi in your project root even when the harness root is local/outside the checkout.
- It avoids accidentally depending on global user Pi skills, prompts, or extensions.

For a one-shot prompt instead of an interactive session:

```bash
/path/to/local/pi-harness/.../bin/pi-harness -p "Use harness_status and tell me what tasks exist."
# repo mode:
npm run pi:print -- "Use harness_status and tell me what tasks exist."
```

## 2. First Commands Inside Pi

Useful slash commands:

```text
/harness-status
/harness-new my-task-name
/skill:harness create a task packet for the work I am about to do
/session
/tree
/fork
/clone
/compact
/login
```

Useful harness tools exposed to Pi:

- `harness_status` — list local tasks and artifact paths.
- `harness_create_task` — create `packet.md`, `progress.md`, and `task.json`.
- `harness_set_active_task` — set the task used by runtime policy and task-scoped tools.
- `harness_record_progress` — append a timestamped checkpoint.
- `harness_writer_lock` — acquire/release/inspect the one-writer lock.
- `harness_tool_policy_check` — preflight risky or unfamiliar tool calls.
- `harness_policy_profile` — apply narrow expiring task-scoped allowlists for reviewed MCP/subagent surfaces.
- `harness_record_external_write_intent` / `harness_record_external_write_proof` — gate and close external writes.
- `harness_memory_search` / `harness_memory_add` / `harness_memory_import` / `harness_memory_prune` / `harness_memory_doctor` — search, record, import, prune, and validate sourced local memory/rules.
- `harness_review_plan_lane` / `harness_review_run_lane` / `harness_review_record_finding` / `harness_review_synthesize` / `harness_review_doctor` — scaffold and optionally run bounded peer/subagent review lanes.
- `harness_task_doctor`, `harness_external_write_doctor`, and `harness_evidence_doctor` — validate task artifacts.
- `harness_write_evidence` — write completion evidence.
- `harness_finish_task` — run finish gates before claiming done.
- `harness_secret_scan`, `harness_run_evals`, and `harness_package_provenance` — local safety/regression checks.

## 3. Normal Task Workflow

For non-trivial work, use this loop:

1. Check existing tasks.
   ```text
   harness_status
   ```
2. Create or reuse a task packet.
   ```text
   harness_create_task(title: "short-task-name", goal: "desired outcome", risk: "green")
   ```
3. Read the returned packet and define scope before editing.
4. If resuming existing work, set the active task.
   ```text
   harness_set_active_task(taskId: "...")
   ```
5. Search memory before repeating prior harness decisions.
   ```text
   harness_memory_search(query: "runtime policy external writes")
   ```
6. For multi-file implementation, acquire the writer lock.
   ```text
   harness_writer_lock(action: "acquire", taskId: "...", owner: "pi", scope: "implementation")
   ```
7. Work in small chunks.
8. Record progress after meaningful milestones, decisions, blockers, or verification.
   ```text
   harness_record_progress(taskId: "...", note: "What changed or what was learned.")
   ```
9. For reviewed MCP/subagent use, apply an expiring task-scoped profile instead of changing the global allowlist.
   ```text
   harness_policy_profile(action: "apply", taskId: "...", profile: "subagent-review", ttlMinutes: 120, clearOnFinish: true)
   ```
10. For review-heavy work, plan lanes or dry-run a bounded reviewer prompt before recording findings. Prefer read-only project agents `harness-reviewer` and `harness-scout`.
   ```text
   harness_review_plan_lane(...)
   harness_review_run_lane(..., live: false)
   harness_review_record_finding(...)
   harness_review_synthesize(taskId: "...")
   ```
11. Before any external write-like action, record an intent; after the write, record proof or cancel the intent.
   ```text
   harness_record_external_write_intent(...)
   harness_record_external_write_proof(...)
   ```
12. Add durable non-secret lessons to memory only when they are sourced; import only repository-local vetted files.
   ```text
   harness_memory_add(kind: "rule", text: "...", source: "...", confidence: "high")
   harness_memory_import(file: "state/memory/imports/old-rules.jsonl", source: "old-harness", dryRun: true)
   harness_memory_prune(dryRun: true, all: true)
   ```
13. Before saying the work is complete, write evidence and finish the task.
   ```text
   harness_write_evidence(...)
   harness_finish_task(taskId: "...")
   ```
14. Release the writer lock after verification or handoff.
   ```text
   harness_writer_lock(action: "release", owner: "pi")
   ```

Task files live here:

```text
state/tasks/<task-id>/packet.md
state/tasks/<task-id>/progress.md
state/tasks/<task-id>/evidence.md
state/tasks/<task-id>/task.json
```

## 4. Safety Rules

Hard boundaries:

- Do not read or print credentials, auth files, token stores, `.env*`, `.npmrc`, `.netrc`, SSH keys, or `.pi-agent/*` auth files.
- Keep credentials out of prompts, logs, traces, task artifacts, and docs.
- Stop and ask if a task requires production-affecting actions.
- Use `harness_tool_policy_check` before destructive, broad, externally visible, or unfamiliar actions.
- The harness extension also installs a runtime `tool_call` gate, controlled by `harness.config.json` `toolPolicy.runtimeEnforcement`.
- External write-like actions need a task-scoped intent before the write and proof or cancellation before finish.
- Third-party Pi packages must pass source review before install.

Yolo mode means "move autonomously where safe," not "ignore policy." Secret reads and credential paths remain blocked.

## 5. Finish Gates And Local Checks

For first-run setup and day-to-day local operation, start with the smaller operator surface:

```bash
npm run harness:bootstrap     # inspect/init local state and setup prerequisites
npm run harness:next          # concise health + recommended next actions
npm run harness:check -- --json   # fast local safety/package/metadata checks
npm run harness:ready -- --json   # pre-rollout readiness, fails on open tasks/locks
```

Use `npm run harness:ready -- --run-gates --json` before a rollout review. Release the writer lock first because full eval gates include writer-lock lifecycle cases.

The main all-up regression command is still:

```bash
npm run gates
```

It runs:

1. `npm run secret:scan`
2. `npm run typecheck`
3. `npm run doctor`
4. `npm run package:provenance`
5. `npm run eval`

Task-specific finish commands outside Pi:

```bash
npm run evidence:doctor -- <taskId>
npm run finish -- <taskId>
```

Inside Pi, prefer the matching tools:

```text
harness_task_doctor(taskId: "...")
harness_external_write_doctor(taskId: "...")
harness_memory_doctor()
harness_review_doctor(taskId: "...")
harness_evidence_doctor(taskId: "...")
harness_package_provenance()
harness_run_evals()
harness_write_evidence(...)
harness_finish_task(taskId: "...")
```

Evidence should include positive proof, negative/failure-mode proof, commands or inspections run, skipped checks with residual risk, diff-risk notes, and future memory candidates if useful. Use `harness_memory_add` after finishing only for candidates that are durable, sourced, and secret-free.

## 6. Package And Extension Work

Pi packages can run code and change agent behavior, so install only after review.

```bash
npm run package:review -- npm:pi-mcp-adapter@2.6.0
npm run package:approval -- doctor --json
npm run package:install-reviewed -- npm:pi-mcp-adapter@2.6.0
npm run package:provenance -- --json
```

Project package declarations are tracked in `.pi/settings.json` and `package-provenance.lock.json`. Portable source-review summaries live in `package-reviews/`; local extraction/work artifacts under `state/package-reviews` stay ignored. Manual approval state for blocked-but-necessary packages is tracked in `package-approvals.json`; see `docs/manual-package-approval.md`. Vendored package tarballs and checksums live in `vendor/manifest.json` and `vendor/npm/`. Package candidates that are not installed yet belong in `docs/pi-extras.md`.

Runtime policy keeps package/MCP/subagent tools blocked unless allowed by a task-scoped policy profile. `npm run policy:profile -- list --json` shows available profiles; apply `mcp-discovery`, `subagent-review`, or exact `mcp-direct-selected` tool names only after reviewing connector scope. Profiles now support TTLs and `clearOnFinish`, and `npm run policy:profile -- prune --dry-run --json` previews stale/done cleanup. `npm run tool:policy -- metadata --json` validates read-only vs write-like connector classifications. `npm run smoke:live -- all --dry-run --json` checks the local policy surfaces without making live LLM calls. `npm run mcp:sandbox -- list --json` provides local non-external MCP fixtures for policy evals.

To trial reviewed project package extensions without loading user-level skills:

```bash
PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 ./bin/pi-harness
```

Only opt into normal user resources when intentionally debugging:

```bash
PI_HARNESS_INHERIT_USER_RESOURCES=1 ./bin/pi-harness
```

## 7. Extra Local Wrappers

Gemini CLI wrapper:

```bash
./bin/gemini-lab
./bin/gemini-lab --prompt "Summarize this lab's README." --output-format text --approval-mode plan --sandbox=false
npm run gemini:smoke
```

Gemini auth is separate from Pi auth.

## 8. Troubleshooting

- Pi needs auth: start `./bin/pi-harness`, run `/login`, and use the isolated lab auth flow. Do not inspect auth files directly.
- Extension changes are not visible: restart `./bin/pi-harness` or use `/reload` if applicable.
- A finish task fails: read the findings, fix evidence/provenance/policy/eval issues, then rerun the finish command.
- A writer lock is stuck: inspect with `harness_writer_lock(action: "status")`; release only if you own it or have verified it is stale.
- Package provenance fails: rerun package review/provenance checks and avoid installing blocked packages.

## 9. Quick Cheat Sheet

```bash
# Start interactive Pi in the isolated lab
./bin/pi-harness

# One-shot Pi prompt
./bin/pi-harness -p "Use harness_status and summarize open tasks."

# Run local checks
npm run harness:bootstrap
npm run harness:next
npm run harness:check
npm run doctor
npm run gates
npm run status

# Finish a task outside Pi
npm run evidence:doctor -- <taskId>
npm run finish -- <taskId>

# Review/install a Pi package safely
npm run package:review -- npm:<package>@<version>
npm run package:approval -- doctor --json
npm run package:install-reviewed -- npm:<package>@<version>
```

Related docs:

- `README.md`
- `docs/pi-primer.md`
- `docs/architecture.md`
- `.pi/skills/harness/SKILL.md`
