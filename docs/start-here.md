# Start Here

This page is reference now. The preferred first-run path is the root `README.md`: run the one-line installer from your existing project, then use `ph`. Repo mode still supports `npm run harness:setup` and `npm run pi` for teams that intentionally version harness entry points.

You may have used Claude Code, Codex, Cursor, or another AI coding tool. You ask for a change. The model reads files, edits code, maybe runs tests, and gives you a summary.

That works for small things. It gets shaky when the work matters.

The shaky part is not the model. The shaky part is the missing operating system around the model. What was the actual task? What was out of scope? What did the agent check? Did it touch a secret file? Did it install a package? Did it write to GitHub or Jira? Can someone else replay the checks?

This repo is that operating layer.

## The short version

A harness gives an AI coding agent a disciplined way to work:

- start with a clear task
- stay inside scope
- block unsafe reads and writes
- record progress
- verify the change
- leave evidence
- make human approval points explicit

It does not make the agent magic. It makes the work less ad hoc.

## What changes when you use it

Without a harness, a session often starts like this:

> Fix the flaky test.

The agent guesses the scope, makes edits, and reports back. Maybe that is fine. Maybe it quietly changed too much.

With this harness, the same work starts more like this:

> Create a task for the flaky checkout test. Do not change production checkout behavior. Find the cause, make the smallest fix, run the targeted test, then write evidence before finishing.

The agent turns that into a [task packet](explanation/core-concepts.md#task-packet). That is just the written brief for the work. The harness tracks the active task. If the agent tries to read protected local files, policy blocks it. If the agent wants to write to an external system, it needs an [intent and read-back proof](explanation/core-concepts.md#external-write-intent). When the work is done, [finish gates](explanation/core-concepts.md#finish-gate) check [evidence](explanation/core-concepts.md#evidence), package provenance, memory, review lanes, policy, secrets, and evals.

It is more ceremony than a casual prompt. That is the point. Serious agent work needs a paper trail.

If the vocabulary is slowing you down, pause here and read [Core Concepts](explanation/core-concepts.md). It is short, and it will make the rest of the docs easier.

## First commands

From your existing project repo:

```bash
curl -fsSL https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install | bash
```

Then use:

```bash
ph models # first-run /login + /model guide
ph        # open Pi in this project
ph next   # ask what to do next
ph done   # finish with evidence and gates
```

What that command means:

- It installs or updates a local harness source copy outside your project.
- It connects this project to a local sidecar with no project writes by default.
- It runs the useful setup path instead of asking you to remember setup flags.
- It tries to install the short `ph` command; if your shell cannot find it, the output includes a direct launcher fallback.
- It checks whether this isolated harness has login/model state and points first-time users to `ph models` before real agent work.
- If you want `.pi-harness/` and npm scripts in the project, use `ph start --mode repo` explicitly.

Inside Pi:

```text
/harness
/harness-brief
```

Then ask the agent to use the harness skill:

```text
Use the harness workflow. Scope this task before editing, record progress, run checks, and write evidence before finishing.
```

## What to read next

If the terms are new, read [Core Concepts](explanation/core-concepts.md).

If the idea is new, read [What Is an Agent Harness?](explanation/what-is-an-agent-harness.md).

If you want to do real work now, read [First Real Task](tutorials/first-real-task.md).

If you are trying to adopt this in another project, read [Adapt the Harness to Your Repo](tutorials/adapt-to-your-repo.md).
