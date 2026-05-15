---
name: harness
description: Use the local Pi harness task packet, progress, and evidence workflow.
---

# Local Pi Harness Workflow

Use this skill for non-trivial work in `pi-harness-lab`.

## Workflow

1. Call `harness_status` to see existing tasks.
2. If there is no suitable task, call `harness_create_task`.
3. Read the task packet path returned by the tool.
4. Set the active task with `harness_set_active_task` when continuing an existing task; new tasks become active automatically.
5. Search reusable local memory with `harness_memory_search` before repeating harness decisions, package policy, or workflow conventions.
6. For multi-file implementation, call `harness_writer_lock` with `action: "acquire"` before editing.
7. Use `harness_tool_policy_check` before risky shell commands, broad edits, external writes, or unfamiliar tools. Runtime policy also blocks disallowed tool calls, and yolo mode can audit risky non-secret actions, but secret paths remain blocked.
8. Before any external write-like action, call `harness_record_external_write_intent`; after the write, call `harness_record_external_write_proof` or cancel the intent.
9. Work in small checkpoints and call `harness_record_progress` after meaningful decisions, blockers, or verification.
10. Record provenance with `harness_record_provenance` for subagents, reviews, important decisions, and handoffs.
11. For model/team/research setup questions, prefer the adopted harness setup command (`.../bin/pi-harness setup` in local mode, `npm run harness:setup` in repo mode) and its generated local prompts instead of separate setup commands or hand-written notes.
12. For task-scoped MCP/subagent access, use `harness_policy_profile` and keep profiles narrow/expiring (`mcp-discovery`, `subagent-review`, or exact `mcp-direct-selected` tools). Prefer `clearOnFinish: true` and validate connector classifications with `npm run tool:policy -- metadata --json`.
13. For peer-review style work, use `harness_review_plan_lane` or dry-run `harness_review_run_lane`, then `harness_review_record_finding`, `harness_review_synthesize`, and `harness_review_doctor`. Prefer read-only project agents `harness-reviewer` and `harness-scout`.
14. If you need a reusable new tool, call `harness_create_tool_proposal` before implementing it.
15. Promote durable lessons with `harness_memory_add` or import vetted repository-local memory with `harness_memory_import`; entries must be sourced and non-secret. Use `harness_memory_prune` dry-run before removing stale or duplicate memory.
16. Before finishing, run `harness_task_doctor`, `harness_external_write_doctor`, `harness_memory_doctor`, `harness_review_doctor`, `harness_package_provenance`, and `harness_run_evals`. Outside Pi, `npm run harness:next` and `npm run harness:check -- --json` provide concise operator summaries.
17. Finish by calling `harness_write_evidence`.
18. Call `harness_finish_task` and fix any task, evidence, external-write, memory, review, secret-scan, provenance, policy, lock, or eval findings before saying the work is done.

## Evidence Standard

Evidence should include:

- Positive proof: what passed or what was confirmed.
- Negative proof: what failure mode or regression was checked.
- Commands run: exact commands or inspections.
- Skipped checks: reason and residual risk.
- Diff risk notes: what could break and how it was mitigated.
- Memory candidates: useful patterns that should become future rules.

Evidence must use exact filled labels:

- `- Command or inspection:`
- `- Result:`
- `- Regression or failure-mode check:`
- `- Check:`
- `- Reason:`
- `- Residual risk:`
- `- Risk:`
- `- Mitigation:`
- `- Candidate:`
- `- Source:`
- `- Confidence:`

## Safety

- Do not read or print secret-bearing files.
- Do not store credentials in task artifacts.
- External writes need an explicit local intent before the write and proof or cancellation before finish.
- Third-party Pi packages need `harness_source_review_package` or `npm run package:review` before install.
- Blocked package reviews require an explicit `harness_package_approval` / `npm run package:approval` record before any install path is allowed.
- Installed Pi packages must pass `harness_package_provenance`.
- Package/MCP/subagent tools remain blocked by runtime policy until narrow task-scoped policy profiles are reviewed, applied, and allowed to expire/clear on finish.
- Prefer read-only project subagents (`harness-reviewer`, `harness-scout`) for review/scouting.
- Memory entries must be sourced, confidence-rated, and secret-free; imports must come from repository-local non-auth paths.
- Keep one active writer for implementation work; release or refresh stale locks.
- If a task requires production-affecting action, stop and ask the project owner.
