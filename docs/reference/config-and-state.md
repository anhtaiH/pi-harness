# Config and State Reference

In an adopted project, these paths live under `.pi-harness/`. In this source repository, they live at the repo root.

## Committed configuration

```text
.pi/settings.json              Pi project settings
harness.config.json            harness policy, metadata, eval config
package.json                   npm scripts and dependencies
package-lock.json              npm dependency lock
package-approvals.json         manual approvals for blocked packages
package-provenance.lock.json   package provenance snapshot
vendor/manifest.json           vendored artifact checksums and review links
```

## Pi resources

```text
.pi/extensions/harness/        harness extension and tools
.pi/skills/harness/            harness skill instructions
.pi/agents/                    read-only review/scout agents
.pi/prompts/                   prompt templates
```

## Generated local state

Generated state lives under `state/` in the harness root, which is `.pi-harness/state/` after project adoption. Most of it is ignored.

If you are new to the terms, read `../explanation/core-concepts.md` before browsing these files. The files make more sense once you know what task packets, progress logs, and evidence are.

```text
state/tasks/                   task packets, progress, evidence
state/sessions/                Pi session files
state/evals/                   eval output
state/traces/                  run traces
state/setup/                   generated setup, optional-battery, and Pi handoff artifacts
state/tmp/                     scratch files
state/status/                  generated dashboard/status JSON
state/policy/                  local policy metadata/audit files
state/memory/                  local memory entries
state/package-reviews/         local package review extraction/output
```

Only `.gitkeep` placeholders are committed by default.

## Package review state

There are two review locations:

```text
package-reviews/               committed portable review summaries
state/package-reviews/         local review working output and extracted packages
```

Provenance prefers committed summaries. Local review state is useful during review, but it should not be required for a fresh clone.

## Private local state

These paths must stay ignored in the harness root:

```text
local Pi login/session directory
state/sessions/
node_modules/
.pi/npm/
state/tmp/
```

Do not commit login state, session files, task history, generated setup prompts, policy audit logs, or memory entries unless they are explicitly sanitized for sharing.

## Package manifest

The package manifest is checked by:

```bash
npm run package:harness -- doctor --json
npm run package:harness -- manifest --json
```

It defines the intended portable repo boundary. If a new doc or script matters for clone-and-run behavior, the manifest should include it. The current manifest includes `docs/` as a directory to avoid per-file doc churn.
