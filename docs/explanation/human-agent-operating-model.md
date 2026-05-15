# Human, Agent, Harness

A good agent workflow is not "let the AI do everything." It is also not "make the human approve every keystroke."

The useful split is simpler:

- the human owns intent and judgment
- the agent does structured work inside the boundary
- the harness records and enforces the boundary

That sounds obvious until a real task gets messy.

A test fails. The agent finds a package mismatch. A fix needs a small schema change. The agent wants to comment on a PR. The line between "go ahead" and "ask me first" can get blurry.

This doc draws that line.

## The human owns the boundary

The human decides what matters.

That includes:

- the goal
- what is out of scope
- acceptable risk
- whether product behavior is right
- whether to approve a blocked package
- whether to write to GitHub, Jira, Slack, or a deploy system
- whether to merge
- whether to release

The human does not need to know every file the agent will read. But the human should set the edges of the task.

A good task request sounds like this:

```text
Fix the duplicate charge bug in checkout. Keep the change small. Do not redesign checkout state. Add or update a test that would fail before the fix. Prepare a draft PR when ready, but do not merge it.
```

That gives the agent room to work. It also says where not to go.

## The agent owns the structured work

The agent should turn the request into a [task packet](core-concepts.md#task-packet), then work through it. That packet is just the written brief for the work.

The agent should:

- clarify ambiguous scope
- inspect the code and docs
- make a plan when the path is not obvious
- acquire the writer lock before implementation
- edit code
- run targeted checks
- record progress when the situation changes
- write evidence before claiming completion
- surface risk instead of hiding it

The agent should not quietly expand authority.

If the fix needs a package install, the agent should stop and route through package review. If the work needs a GitHub comment, the agent should record external-write intent first. If a product decision is unclear, the agent should ask.

## The harness owns the process

The harness is not smart in the way the model is smart. It is useful because it is stubborn.

It blocks protected paths. It tracks the active task. It checks [evidence](core-concepts.md#evidence). It enforces package provenance. It records [external-write intent and proof](core-concepts.md#external-write-intent). It keeps generated state out of the repo. It makes the agent leave a trail.

When the agent gets enthusiastic, the harness is the part that says: not without a task, not without evidence, not without approval.

## A practical responsibility split

| Work | Human | Agent | Harness |
| --- | --- | --- | --- |
| Define the goal | Owns it | Drafts task wording | Stores it |
| Set scope and risk | Owns it | Proposes details | Validates packet structure |
| Read code and docs | Guides when needed | Does it | Blocks protected reads |
| Edit code | Approves the boundary | Does it | Enforces writer lock and policy |
| Install packages | Approves risk | Reviews and proposes | Checks review, approval, provenance |
| Use MCP/connectors | Approves use | Discovers and calls within scope | Requires metadata and policy profile |
| Write externally | Authorizes it | Performs only after intent | Requires proof or cancellation |
| Verify work | Judges sufficiency | Runs checks and writes evidence | Runs finish gates |
| Open a PR | Authorizes it | Creates draft and body | Records external write |
| Merge | Owns it | Recommends | Does not decide |
| Deploy | Owns it | Assists | Requires explicit intent |

## Where teams get into trouble

The common failure is not that the agent edits code. That is the easy part.

The failure is implicit authority.

The agent decides the real scope. The agent decides a package is fine. The agent decides a test is enough. The agent opens a PR with a confident summary. The human reviews the diff but not the process that produced it.

The harness pushes back on that pattern. It makes the work legible.

## Best practice

Give the agent a real job, not a vague wish.

Bad:

```text
Improve auth.
```

Better:

```text
Investigate why expired sessions sometimes show a blank page. Do not change login flow. If you find the cause, make the smallest fix and add a regression test. If the fix touches session storage or provider config, stop and ask first.
```

The second request gives the agent enough authority to be useful. It also keeps the human in charge of the parts that require judgment.
