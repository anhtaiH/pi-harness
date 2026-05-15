# Core Concepts

This repo uses a few words that may sound heavier than they are.

They are not magic. They are names for the parts of a work loop that usually stay hidden in chat.

## Task packet

A task packet is the written brief for a piece of agent work.

It answers:

- What are we trying to do?
- What is in scope?
- What is out of scope?
- How risky is this?
- How will we check it?
- When should the agent stop and ask?

If you have used plan mode, think of the task packet as the part of the plan that survives outside the chat. It lives in the repo's local state so the agent, human, and finish gate can all refer to the same brief.

Example:

```text
Goal: Fix the checkout total test.
Scope: Test fixture and related assertion only.
Forbidden: Do not change production checkout calculation unless investigation proves a product bug.
Verification: Run the targeted checkout test.
Stop: Ask if the fix needs a package install or a production behavior change.
```

File shape:

```text
state/tasks/<task-id>/packet.md
```

## Progress log

A progress log is a short running record of what changed during the task.

It is not a diary. It is not a transcript. It is a trail of useful checkpoints.

Good progress entry:

```text
Found the failing assertion. The fixture uses stale tax data. Next step: update fixture only and run checkout-total.test.ts.
```

Weak progress entry:

```text
Working on it.
```

File shape:

```text
state/tasks/<task-id>/progress.md
```

## Evidence

Evidence is the agent's proof that the work was actually checked.

A final chat summary is not evidence. It can be helpful, but it is too easy to make it sound better than the work.

Evidence should say:

- what changed
- what command or inspection passed
- what failure mode was checked
- what was skipped and why
- what risk remains

Good evidence:

```text
Positive proof: checkout-total.test.ts passes.
Negative proof: the non-discount checkout path still renders the original total.
Skipped: full integration suite, because this touched only a test fixture. Residual risk: low, but run full suite before release branch cut.
```

File shape:

```text
state/tasks/<task-id>/evidence.md
```

## Finish gate

A finish gate is the final check before the harness marks a task done.

It is a bundle of boring checks that humans and agents often skip when they are tired:

- Does the task packet have real scope?
- Does evidence exist?
- Are external-write intents closed?
- Did secret scan pass?
- Is package provenance valid?
- Are policy profiles healthy?
- Is the writer lock released?
- Did evals pass?

A finish gate does not prove the code is correct. It proves the task did not bypass the harness.

## Writer lock

A writer lock says one agent/session owns implementation writes right now.

This matters when you have multiple agents, review lanes, or interrupted sessions. Without a lock, two helpers can edit around each other and leave a mess that looks like a normal diff.

The lock is local. It is not a distributed database. It is a simple guardrail.

## External-write intent

An external-write intent is a record made before the agent changes something outside the repo.

Examples:

- open a PR
- comment on a GitHub issue
- transition a Jira ticket
- edit Confluence
- post to Slack
- deploy or release

The intent says what the agent plans to do, why, how it will verify the result, and how to correct it if wrong.

After the write, the agent records proof. If the write does not happen, it cancels the intent.

## Package provenance

Package provenance is the record of why a package is allowed here.

Agent packages and CLI packages can change what the agent can do. The harness records source-review summaries, vendored artifact checksums, install state, and manual approvals.

If a package review is blocked but a human accepts the risk, the block stays visible. The approval explains why the risk was accepted.

## Policy profile

A policy profile is a temporary permission set for a task.

MCP and subagent tools are powerful. The harness keeps them blocked by default. A profile can enable a narrow capability, such as MCP discovery, for one task and one time window.

The profile can expire. It can also clear when the task finishes.

## Review lane

A review lane is a bounded second pass.

It can be manual, dry-run, or live with a subagent. The important part is that the review has a scope and records findings instead of becoming another vague chat.

Example lanes:

- safety review
- test review
- architecture review
- docs review

## Memory

Memory is for durable, sourced, non-secret facts or patterns.

It is not a place to dump everything the agent saw. If a note will help future tasks and has a source, it may belong in memory. If it contains company-sensitive context or credentials, it does not.

## Project adapter

A project adapter is a small non-secret file that tells the harness how to work in another repo.

It can point to important docs, normal checks, connector metadata, and project-specific stop conditions. It should not weaken the core harness policy.

## The short version

The harness turns agent work into a loop:

```text
Task packet -> progress -> implementation -> checks -> evidence -> finish gate
```

That loop is the mental model. The commands are just how you operate it.
