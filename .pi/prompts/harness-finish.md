---
description: Finish a local harness task with evidence
---

Finish the active harness task. Use `harness_write_evidence` with:

- Summary
- Positive proof
- Negative proof
- Commands run
- Skipped checks and residual risk
- Diff risk notes
- Memory candidates

Then use `harness_finish_task`. If it reports findings, fix them before summarizing.

Before finishing, also run:

- `harness_package_provenance`
- `harness_run_evals`
- `harness_writer_lock` with `action: "status"`

Task:

$ARGUMENTS
