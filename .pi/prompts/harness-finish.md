---
description: Finish a local harness task with evidence
---

Finish the active harness task with the done flow first:

- Prefer `harness_done_task` (or `/harness-done` / `ph done` outside Pi).
- It should run project checks, auto-plan risk-based review, write proof ledger entries, run evidence doctor/drafting, and finish gates.
- If it reports findings, fix them before summarizing.

If the done tool is unavailable, fall back to `harness_write_evidence` with summary, positive proof, negative proof, commands run, skipped checks/residual risk, diff risk notes, and memory candidates; then use `harness_finish_task`.

Task:

$ARGUMENTS
