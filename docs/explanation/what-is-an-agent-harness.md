# What Is an Agent Harness?

An AI coding agent is not just a chat box. It can read code, change files, run commands, call tools, and sometimes write to external systems.

That is useful. It is also where casual prompting starts to break down.

An agent harness is the operating layer around the agent. It gives the agent a workspace contract, safety boundaries, checks, memory, review flow, and evidence requirements.

It answers a plain question:

> If an agent is going to act in this repo, what rules does it work under?

## The problem with normal AI coding sessions

Most people start with prompts.

> Refactor this file.

> Fix the test.

> Add the endpoint.

The agent may do a good job. But the work is often hard to audit.

What was the task? What was explicitly out of scope? Which checks ran? Did the agent inspect the right files or just the obvious ones? Did it install something? Did it write to GitHub? Did it leave enough proof for a reviewer?

The answer is usually buried in chat history, if it exists at all.

That is fine for a toy change. It is not enough for code you plan to merge.

## The harness changes the unit of work

The unit of work is not the prompt. It is the task.

A task has:

- a goal
- scope
- risk level
- desired behavior
- verification plan
- stop conditions
- evidence when finished

In this repo, that written brief is called a [task packet](core-concepts.md#task-packet). The proof at the end is called [evidence](core-concepts.md#evidence). The final check is called a [finish gate](core-concepts.md#finish-gate). The names are less important than the habit: write down the boundary, do the work, prove what happened.

The agent can still use natural language. You do not need to become a process robot. But the work now has shape.

A vague prompt becomes a bounded job.

## Familiar tools, stricter workflow

If you have used Claude Code, Codex, or Cursor, most of the pieces will feel familiar.

You still ask the agent to investigate. You still ask it to edit code. You still run tests. You still review the result.

The difference is that the harness makes the important parts explicit.

| Familiar habit | Harness version |
| --- | --- |
| Ask the agent to fix something | Create a task packet first |
| Use plan mode | Record scope, risk, and stop conditions |
| Let the agent edit files | Acquire a writer lock for implementation work |
| Trust the final summary | Require evidence with positive and negative proof |
| Install a package | Source review, approval, and provenance |
| Add an MCP or connector | Metadata, policy profile, and external-write rules |
| Open a PR | External-write intent and proof |

This is not about slowing the agent down. It is about making the work survivable after the chat scrolls away.

## What the harness does not do

It does not remove judgment. It does not make every agent action safe. It does not prove the code is correct.

It gives you better defaults:

- unsafe paths are blocked
- risky package installs are gated
- external writes need explicit intent
- finish gates catch missing evidence
- state stays local and ignored by default
- clone-and-run setup behaves the same on another machine

You can still make a bad decision. The harness makes it harder to make one quietly.

## The useful mental model

Treat the agent as a capable operator inside a bounded workspace.

The human owns the goal and judgment. The agent does the structured work. The harness keeps the boundary visible.

That is the paradigm.
