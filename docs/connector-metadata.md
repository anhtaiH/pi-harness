# Connector Tool Metadata

Connector tools stay blocked by default unless a task-scoped policy profile allows the exact tool or the reviewed lazy MCP discovery surface. Metadata only classifies a tool after it is otherwise allowlisted; it does not grant access by itself.

## Classification rules

Each configured tool metadata entry should choose exactly one behavior:

- `readOnly: true`, `externalWrite: false` for bounded read/search/status tools.
- `readOnly: false`, `externalWrite: true` for tools that create, update, comment, transition, deploy, publish, merge, close, or otherwise mutate an external system.

Always include a short `description` and an `owner` so reviewers can tell why the classification exists.

## Local commands

```bash
npm run tool:policy -- metadata --json
npm run tool:policy -- doctor --json
```

`metadata` validates the catalog and reports read-only vs external-write counts. `doctor` fails if entries are ambiguous, contradictory, or missing descriptions.

## Current templates

`harness.config.json` includes local sandbox entries plus explicit examples for common connector shapes:

- `sandbox_docs_search`, `sandbox_status` — local read-only fixtures.
- `sandbox_issue_comment` — local write-like fixture that policy evals gate with an external-write intent.
- `github_issues_list`, `jira_search`, `slack_search` — read-only connector examples.
- `github_issue_comment`, `jira_transition_issue`, `slack_post_message` — write-like connector examples.

These examples are inert unless the exact tool is allowed for a task. Prefer exact names over wildcards. If a real connector uses different names, add reviewed explicit entries before selecting those tools with `mcp-direct-selected`.

## Rollout checklist for a real connector

1. Discover tools in a dedicated task using an expiring `mcp-discovery` profile.
2. Classify candidate tools in `harness.config.json` or task-local metadata.
3. Run `npm run tool:policy -- metadata --json`.
4. Select only exact reviewed direct tools with `mcp-direct-selected`.
5. For every write-like tool, record an external-write intent before execution and proof/cancellation after.
6. Keep credentials in connector-native stores or approved Keychain-backed wrappers; never in task artifacts.
