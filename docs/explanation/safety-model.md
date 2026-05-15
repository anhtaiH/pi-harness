# Safety Model

The harness is not safe because it trusts the agent. It is safe because it limits what the agent can do without leaving a trace.

The model is simple:

- local state by default
- protected files stay protected
- risky tools are checked at runtime
- external writes need intent and proof
- package changes need review and provenance
- powerful tool surfaces are opt-in and task-scoped

## Local first

Generated harness state lives under `state/`. Pi session and login state live under `.pi-agent/` and `state/sessions/`. These paths are ignored.

The repo commits behavior, docs, evals, wrappers, package metadata, and empty state placeholders. It does not commit local sessions or task history by default.

## Protected reads

The agent must not read private local files just because they are nearby.

The policy blocks common secret-bearing paths and credential stores. It also blocks commands that try to print environment secrets or auth tokens.

This matters because agents are good at following threads. If an error message points at a local config file, an unbounded agent may try to inspect it. The harness says no.

## External writes

A write to GitHub, Jira, Slack, Confluence, a deploy system, or a release tool is different from editing a local file.

The agent needs to record:

- what it plans to write
- why it is needed
- what should change
- how it will verify the result
- how to correct it if wrong

After the write, the agent records read-back proof. If the write does not happen, it cancels the intent.

This is not bureaucracy. It prevents "the agent just commented/merged/deployed" from becoming a surprise.

## Packages

Packages can change the agent's behavior. Some packages are ordinary dependencies. Some are executable agent extensions. Some are powerful CLIs.

The harness uses source-review summaries, provenance locks, vendored artifact checksums, and manual approval records.

A blocked review does not disappear. If a human accepts the risk, that acceptance is explicit and expiring.

## MCP and subagents

MCP tools and subagents are useful. They are also a common place where teams accidentally give the agent too much reach.

This harness keeps them blocked by default. A task can apply a narrow profile, such as MCP discovery or subagent review. Profiles can expire and clear on finish.

The default posture is deliberate: discover first, enable narrowly, prove what happened.

## Finish gates

The finish gate checks the boring parts people skip when tired:

- task packet
- evidence
- external-write closure
- memory health
- review-lane records
- secret scan
- package provenance
- policy profile health
- writer lock
- evals

The finish gate does not prove the code is good. It proves the work did not bypass the harness.

## What this does not protect against

A human can still approve a bad plan. A test can still miss a bug. A package can pass static review and still have a problem. A model can misunderstand code.

The harness reduces silent failure. It does not remove judgment.
