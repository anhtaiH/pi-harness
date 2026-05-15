# How to Finish a Task

A task is not done when the agent says it is done. It is done when [evidence](../explanation/core-concepts.md#evidence) exists and the [finish gate](../explanation/core-concepts.md#finish-gate) passes.

Evidence is the proof. The finish gate is the final harness check.

## 1. Prefer the done flow

From the shell:

```bash
npm run harness:done -- --task <taskId> --json
```

Or, in local wrapper mode:

```bash
/path/to/local/pi-harness/.../bin/pi-harness done --task <taskId>
```

Or inside Pi, use `harness_done_task` / `/harness-done`.

The done flow checks the task packet, auto-plans a fresh-context review lane when risk policy calls for one, runs configured project checks, writes a proof ledger with command transcripts, drafts evidence when needed, validates evidence, and runs the finish gate. If it blocks, fix the reported blocker and rerun it.

## 2. Manual fallback: check the task packet

```bash
npm run task:doctor -- <taskId> --json
```

Fix missing scope, desired behavior, verification, or stop conditions.

## 3. Manual fallback: write evidence

Inside Pi, ask the agent:

```text
Write harness evidence for this task with summary, positive proof, negative proof, commands run, skipped checks, diff risk notes, and memory candidates.
```

Evidence should be specific. "Tests passed" is weaker than "checkout-total.test.ts passed and the non-discount path still renders the original total."

## 4. Validate evidence and proof ledger

```bash
npm run evidence:doctor -- <taskId> --json
npm run harness:proof -- doctor --task <taskId> --json
```

## 5. Close external writes

If the task planned a GitHub comment, PR, Jira update, deploy, or similar action, every intent needs proof or cancellation.

```bash
npm run external-write -- doctor --task <taskId> --json
```

## 6. Release the writer lock

If implementation is done, release the lock before full gates.

```text
Use harness_writer_lock to release the active writer lock for this task.
```

## 7. Run finish

```bash
npm run finish -- <taskId> --json
```

Or inside Pi:

```text
Run the finish gate for this task.
```

## If finish blocks

Do not edit the evidence to silence the gate unless the evidence is genuinely wrong.

Common blockers:

- missing negative proof
- skipped checks without residual risk
- open external-write intent
- stale memory entry
- failed package provenance
- active writer lock
- failed eval

Fix the cause, then rerun finish.
