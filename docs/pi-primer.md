# Pi Primer For This Lab

Research and setup date: 2026-05-12.

## What Pi Gives Us

Pi is a small coding-agent runtime with extension points instead of a large baked-in workflow. The useful primitives for a harness are:

- Extensions: TypeScript modules that can register LLM tools, slash commands, UI, and lifecycle hooks.
- Skills: progressive instruction bundles under `SKILL.md`.
- Prompt templates: reusable slash-command prompts.
- Packages: npm/git/local bundles that can include extensions, skills, prompts, and themes.
- Project settings: `.pi/settings.json`.
- Context files: `AGENTS.md`/`CLAUDE.md`, plus `.pi/APPEND_SYSTEM.md` or `.pi/SYSTEM.md`.
- Sessions: saved conversations controlled by `--session-dir`, `PI_CODING_AGENT_SESSION_DIR`, or settings.

## Starting The Lab

```bash
cd your-project
npm run doctor
./bin/pi-harness
```

The wrapper sets:

```bash
PI_CODING_AGENT_DIR=.pi-harness/local-pi-state
--session-dir .pi-harness/state/sessions
```

By default it also blocks inherited user resources and explicitly loads only:

- `.pi/extensions/harness/index.ts`
- `.pi/skills/harness`
- `.pi/prompts`
- `.pi/APPEND_SYSTEM.md` through project settings

Opt into normal user resources only when debugging:

```bash
PI_HARNESS_INHERIT_USER_RESOURCES=1 ./bin/pi-harness
```

Trial reviewed project package extensions without user-level skills or package prompt templates:

```bash
PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 ./bin/pi-harness
```

Current reviewed project packages:

- `pi-mcp-adapter@2.6.0`
- `pi-subagents@0.24.2`

Current blocked package:

- `pi-lens@3.8.43`, because the npm tarball declares a `postinstall` downloader.

## First Commands Inside Pi

```text
/harness-status
/harness-new prototype-evidence-doctor
/skill:harness create a task packet for adding a finish gate
```

Useful native Pi session commands:

```text
/session
/tree
/fork
/clone
/compact
/login
```

## One-Shot Mode

Use print mode when you want a single answer or smoke test:

```bash
./bin/pi-harness -p "Use harness_status and tell me what tasks exist."
```

## Credentials

Pi credentials for an adopted project are isolated in the ignored harness sidecar state.

Do not read or print login/session files. If Pi needs auth, start `npm run pi` and run `/login`.

API keys can also be provided through environment variables such as:

```bash
export OPENAI_API_KEY="..."
export ANTHROPIC_API_KEY="..."
export GEMINI_API_KEY="..."
```

Use environment variables only when you intentionally want API-key-backed usage.

## How To Build What Pi Needs

For local harness features, prefer this order:

1. Add or update a skill when the need is mostly instruction or workflow.
2. Add a prompt template when the need is a repeatable command shape.
3. Add an extension tool when Pi must read/write structured state, enforce a rule, or expose a capability to the model.
4. Package it only after the local version is stable and has tests.

Local resource paths:

```text
.pi/extensions/harness/index.ts
.pi/skills/harness/SKILL.md
.pi/prompts/
state/tasks/
state/notes/
state/reviews/
```

After extension edits:

```bash
npm run typecheck
npm run doctor
npm run secret:scan
```

If Pi is already open, use `/reload` after editing an auto-discovered extension or restart the wrapper.

## Finish Gates

Local tasks can now be checked and finished with:

```bash
npm run evidence:doctor -- <taskId>
npm run finish -- <taskId>
npm run gates
```

The Pi extension exposes matching tools:

- `harness_task_doctor`
- `harness_evidence_doctor`
- `harness_external_write_doctor`
- `harness_memory_search`
- `harness_memory_add`
- `harness_memory_doctor`
- `harness_review_plan_lane`
- `harness_review_record_finding`
- `harness_review_synthesize`
- `harness_review_doctor`
- `harness_secret_scan`
- `harness_source_review_package`
- `harness_package_provenance`
- `harness_tool_policy_check`
- `harness_writer_lock`
- `harness_record_external_write_intent`
- `harness_record_external_write_proof`
- `harness_cancel_external_write_intent`
- `harness_run_evals`
- `harness_finish_task`

`npm run gates` currently runs:

1. secret scan
2. TypeScript typecheck
3. project doctor
4. package provenance check
5. eval replay

The finish task gate also runs task packet validation, external-write closure, memory validation, review-lane validation, tool-policy doctor, and writer-lock doctor.

## Yolo Mode

Yolo mode means the harness should bias toward autonomous execution while still keeping hard boundaries:

- Secret reads remain blocked.
- Credential paths remain blocked.
- Destructive or broad shell actions are audited, not silently ignored.
- External writes need a task-scoped intent, and finish gates require proof or cancellation for recorded intents.

Check proposed risky actions with:

```bash
npm run tool:policy -- check --tool bash --input-json '{"cmd":"rm -rf state/tmp"}' --yolo
```

Inside Pi, use `harness_tool_policy_check` with `yolo: true`.

The harness extension also installs a runtime `tool_call` policy gate for active Pi sessions. Keep using the explicit policy tool before risky actions because it gives earlier, clearer feedback and works outside Pi.

## Writer Lock

Use the one-writer lock before multi-file implementation:

```bash
node scripts/writer-lock.mjs acquire --task <taskId> --owner pi --scope implementation
node scripts/writer-lock.mjs status
node scripts/writer-lock.mjs release --owner pi
```

The finish gate fails if an expired lock is left behind. An active lock is allowed so a long-running handoff can preserve ownership.

## Trace, Provenance, And Evals

Record useful run events:

```bash
npm run trace -- checkpoint --run <runId> --task <taskId> --label "verified gates"
```

Record review, subagent, or decision provenance:

```bash
node scripts/provenance.mjs record --task <taskId> --kind decision --source pi --scope "tool policy"
```

Use local memory/rules when a lesson should survive beyond a task:

```bash
npm run memory -- search --query "runtime policy"
npm run memory -- add --kind rule --text "..." --source "task/evidence" --confidence high --tags policy,runtime
npm run memory -- doctor --json
```

Plan and synthesize review lanes without launching live subagents:

```bash
npm run review:lane -- plan --task <taskId> --lane safety --scope "diff" --prompt "Review for secrets."
npm run review:lane -- finding --task <taskId> --lane-id <laneId> --title "..." --detail "..." --recommendation "..."
npm run review:lane -- synthesize --task <taskId>
```

Replay local evals:

```bash
npm run eval -- --json
```

Eval cases live in `evals/*.json` and write latest results to `state/evals/latest.json`.

`state/evals` and `state/traces` are intentionally scanned by `npm run secret:scan`. Generated output should not contain credentials; if it does, the harness should fail instead of hiding it.

## Package Rule

Pi packages can run code and influence agent behavior. Review source before installing third-party packages. Prefer project-local installs:

```bash
npm run package:review -- npm:pi-mcp-adapter@2.6.0
npm run package:install-reviewed -- npm:pi-mcp-adapter@2.6.0
npm run package:provenance -- --json
```

The canonical installed package list is `.pi/settings.json` `packages`. Candidate packages that have not been installed yet belong in `docs/pi-extras.md`, not `harness.config.json`.

Use temporary extension loading for experiments when the package supports it:

```bash
pi -e npm:some-package
```
