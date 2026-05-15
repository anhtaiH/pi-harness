# First Real Task

This tutorial shows the harness workflow on a real code task.

Use a small bug or cleanup. Do not start with a migration. The goal is to learn the rhythm.

If the terms are new, keep `../explanation/core-concepts.md` open. It explains the harness vocabulary in plain language.

## 1. Give the agent a bounded request

Good request:

```text
Fix the failing checkout total test. Keep the change small. Do not change production checkout behavior unless you find a real bug. Run the targeted test and write evidence before finishing.
```

This gives the agent a goal, a boundary, and a check.

Weak request:

```text
Fix checkout.
```

That is too broad. The agent may guess well, but you have made guessing part of the workflow.

## 2. Create the task

Inside Pi:

```text
/harness-new fix-checkout-total-test
```

Or ask the agent:

```text
Create a harness task for this work. Fill in scope, desired behavior, verification, and stop conditions before editing.
```

The [task packet](../explanation/core-concepts.md#task-packet) is the first handoff between human and agent. It is the written brief: goal, scope, risk, checks, and stop conditions. Read it if the work matters.

## 3. Let the agent investigate

The agent should inspect the relevant code, test, and docs. It should not edit yet if the cause is unclear.

A good agent update sounds like this:

```text
I found the failing assertion in checkout-total.test.ts. The test fixture uses stale tax data. I will update the fixture only and run the targeted test.
```

A risky update sounds like this:

```text
I changed checkout calculation and updated snapshots.
```

That may be right, but it needs more explanation. The scope moved.

## 4. Acquire the writer lock before edits

For implementation work, the agent should acquire the writer lock.

```text
Acquire the writer lock for the checkout test fix, then make the smallest edit.
```

The [writer lock](../explanation/core-concepts.md#writer-lock) is not complicated. It says one agent owns writes right now.

## 5. Run targeted checks

Ask for the smallest meaningful check first:

```text
Run the targeted checkout test. If it passes, run the related package test or typecheck if appropriate.
```

Do not jump straight to full gates after every keystroke. Use targeted checks while working, then broader checks near the end.

## 6. Write evidence

When the code is done, the agent should write evidence.

[Evidence](../explanation/core-concepts.md#evidence) should include:

- what changed
- what passed
- what failure mode was checked
- what was skipped and why
- residual risk

Ask directly:

```text
Write harness evidence with positive proof, negative proof, commands run, skipped checks, and residual risk.
```

## 7. Finish the task

```text
Run the finish gate for this task.
```

The [finish gate](../explanation/core-concepts.md#finish-gate) is the final harness check before the task is marked done.

If it blocks, fix the finding. Do not hand-wave it away. The block is usually telling you something useful: missing evidence, open external-write intent, stale policy profile, package provenance issue, failed eval, or active writer lock.

## What the human should review

Do not only review the diff.

Review:

- the task packet
- the scope
- the tests that ran
- the evidence
- the residual risk
- the diff

That takes longer than reading a summary. It is also how you avoid being fooled by a confident agent.
