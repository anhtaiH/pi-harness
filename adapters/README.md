# Harness Project Adapters

Project adapters are small, non-secret files that describe how this portable harness should behave for a specific repository or company context.

Adapters should answer:

- What project root should the harness operate on?
- Which docs are useful starting context?
- Which local checks are safe and expected?
- Which connector tools exist, and are they read-only or write-like?
- Which project-specific stop conditions should agents remember?

Rules:

- Keep adapters non-secret and reviewable.
- Do not include API keys, login/session paths, private tokens, or user-global agent state.
- Keep MCP/subagent access task-scoped; adapters describe tools, they do not grant access.
- Write-like connector actions still require external-write intent/proof.

Start from `example-project.harness.json` and copy it to a project-specific name.
