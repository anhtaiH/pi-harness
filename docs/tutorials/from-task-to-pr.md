# From Task to PR

This is the workflow for getting from "we need a code change" to a PR that a human can merge.

The short version: the agent can do most of the mechanical work. The human owns the boundary and the merge.

If terms like task packet, evidence, or external-write intent are new, read `../explanation/core-concepts.md` first.

## 1. Human gives intent

Start with a request that includes the real constraints.

```text
Fix the bug where expired sessions show a blank page. Keep the fix small. Do not redesign login. Add a regression test. Prepare a draft PR when ready, but do not merge.
```

The human owns this part. If the request is vague, the agent should ask questions before editing.

## 2. Agent creates the task packet

The [task packet](../explanation/core-concepts.md#task-packet) is the written brief for the work. The agent turns the request into:

- goal
- scope
- forbidden areas
- desired behavior
- verification plan
- stop conditions

The task packet is worth reviewing for anything risky. This is where you catch scope drift early.

## 3. Agent investigates

The agent reads code, tests, docs, and related history if available. It records meaningful findings in progress.

The agent should stop and ask if:

- product behavior is ambiguous
- the fix crosses a boundary the human set
- a package install is needed
- external systems need to be changed
- three attempts fail

## 4. Agent edits inside the boundary

The agent acquires the writer lock, makes the smallest useful change, and runs targeted checks.

If the agent discovers the original task was wrong, it should say so. A good harness workflow makes it safe to stop and re-scope.

## 5. Agent verifies

Verification should include positive and negative proof.

Positive proof:

```text
The targeted session expiry test passes.
```

Negative proof:

```text
I also checked the non-expired session path still renders the dashboard.
```

The negative proof matters. Many regressions come from fixing one path and breaking its neighbor.

## 6. Agent writes evidence

[Evidence](../explanation/core-concepts.md#evidence) is the handoff from agent work to human review.

It should not be a sales pitch. It should say what happened, what was checked, what was skipped, and what still worries the agent.

## 7. Agent prepares the PR

The agent can prepare:

- branch
- commit
- draft PR title and body
- test plan
- risk notes
- rollback notes

Opening the PR is an [external write](../explanation/core-concepts.md#external-write-intent). The agent must record intent first, perform the write, then record read-back proof.

PRs should be draft by default.

## 8. Human reviews

The human reviews the diff and the harness evidence.

Good review questions:

- Did the task scope match the original intent?
- Did the agent change more than needed?
- Did the tests prove the right thing?
- Is the residual risk acceptable?
- Is the PR body honest about what changed?

The human can ask the agent to address review comments. That becomes more agent work inside the same task or a follow-up task.

## 9. Human merges

Merge is human-owned unless explicitly delegated.

The agent can recommend merge readiness. It should not treat a passing gate as permission to merge.

## 10. After merge

The agent can help with follow-up:

- update docs
- watch CI
- prepare rollout notes
- create a cleanup task
- summarize what changed

Deploy or release is another explicit human boundary. Treat it as an external write with its own intent and proof.

## A real boundary example

If the agent needs to comment on a PR:

1. Record external-write intent.
2. Post the comment.
3. Read it back.
4. Record proof.

If the agent needs to merge the PR:

Stop. Ask the human. Merge is not a side effect of implementation.
