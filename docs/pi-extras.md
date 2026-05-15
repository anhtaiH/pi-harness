# Pi Extras Shortlist

Research date: 2026-05-12.

Pi has a fast-moving package ecosystem. The rule for this harness is: source review first, project-local install second, permanent dependency last.

## Current Trial State

Reviewed, vendored, and configured as opt-in batteries:

- `pi-mcp-adapter@2.6.0`
- `pi-subagents@0.24.2`
- `pi-intercom@0.6.0`
- `pi-web-access@0.10.7`
- `pi-prompt-template-model@0.9.3`

Reviewed and blocked:

- `pi-lens@3.8.43`, because the package declares `postinstall: node scripts/download-grammars.js`.

Trial command:

```bash
npm run harness:setup
PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 ./bin/pi-harness
```

That mode loads reviewed project package extensions while still suppressing user-level skills and package prompt templates. Full user-resource mode remains available through `PI_HARNESS_INHERIT_USER_RESOURCES=1`, but that is not the default trial path.

## Install-Candidate Packages

| Package | Current observed version | Why it matters | Caution |
| --- | ---: | --- | --- |
| `pi-mcp-adapter` | `2.6.0` | Connects existing MCP servers to Pi and supports direct MCP tools for selected agents. This is the likely bridge for Jira/Slack/docs/build-style tool surfaces. | Broad tool access. Needs allowlists, source review, and credential-boundary checks. |
| `pi-subagents` | `0.24.2` | Adds child Pi sessions, builtin scout/researcher/planner/worker/reviewer/oracle roles, chains, and parallel runs. This maps directly to peer review lanes. | Must enforce one-writer discipline, provenance, and bounded context. |
| `pi-web-access` | `0.10.7` | Adds web search, fetch, GitHub cloning, PDF extraction, YouTube, and local video analysis. It is also used by `pi-subagents` researcher flows. | Network surface area plus optional third-party/API-key providers. Reviewed/vendored, but still opt-in at runtime. |
| `pi-intercom` | `0.6.0` | Lets subagents ask the parent for decisions instead of guessing. | Use for bounded handoffs, not unsupervised work. |
| `pi-prompt-template-model` | `0.9.3` | Adds reusable prompt/model workflow helpers. | Useful for teams; still optional and reviewed/vendored. |
| `pi-lens` | `3.8.43` | Adds real-time LSP, diagnostics, formatting, linting, and secret scan feedback around edits. Strong fit for our LSP-first harness rule. | Blocked for now because the tarball has a `postinstall` downloader and a broad process-execution surface. Revisit only with manual source review or a no-lifecycle install strategy. |
| `context-mode` | `1.0.123` | Adds context-saving sandbox tools, local FTS/SQLite knowledge, and Pi lifecycle hooks. Interesting for continuity and cross-agent context. | Bigger architecture choice, Elastic-2.0 license, native dependencies, and overlapping memory goals. Evaluate separately. |

## Other Packages Worth Watching

- `@gotgenes/pi-permission-system`: permission enforcement for Pi.
- `pi-agent-browser-native`: exposes browser automation to Pi.
- `pi-agent-flow`, `pi-crew`, `taskplane`: alternative orchestration/team packages.
- `pi-context`, `pi-context-usage`, `pi-context-prune`: narrower context-management packages.
- `pi-smart-fetch`: fetch/extraction alternative to `pi-web-access`.

## Recommended Trial Order

1. `pi-mcp-adapter` in a disposable project-local install. Goal: prove existing MCP-style tools can be surfaced without leaking credentials or flooding context. Status: installed.
2. `pi-subagents` with a one-writer wrapper policy. Goal: reproduce current parallel review lanes with better handoffs. Status: installed.
3. `pi-intercom`, `pi-web-access`, and `pi-prompt-template-model` as reviewed/vendored opt-in batteries. Status: configured but not loaded by default.
4. `pi-lens` on this lab only. Goal: verify LSP diagnostics and secret-scan behavior without unexpected formatting churn. Status: blocked by source-review gate.
5. `context-mode` as a separate experiment after the basic harness state machine is real.

Project-local install pattern:

```bash
npm run package:review -- npm:pi-mcp-adapter@2.6.0
npm run package:install-reviewed -- npm:pi-mcp-adapter@2.6.0
```

Do not run installs as a batch unless reviews already exist and have non-blocked verdicts. Install one, inspect what changed under `.pi/`, restart Pi, and run `npm run doctor`.

## Build Ourselves

These are harness-specific enough that we should build them locally first:

- `harness_finish_task`: validates task state and evidence before completion.
- `harness_evidence_doctor`: checks packet, progress, evidence, commands, and residual risk.
- Secret-path denylist: blocks reads of `.env*`, `.npmrc`, `.netrc`, SSH keys, auth files, Cursor/Codex/Pi/Gemini auth configs, and browser profiles.
- External-write intents: records planned Jira/Confluence/Slack/GitHub writes before using connector tools.
- One-writer lock: ensures implementation writes are owned by a single active agent lane.
- Review provenance: stores which model/agent reviewed which diff, when, and with what scope.
- Status dashboard: generates `state/status/latest.json` and a static HTML task dashboard.
- Source-review gate for packages: downloads package tarballs, summarizes entrypoints/scripts/dependencies, and requires explicit approval before install.

The philosophy is not "install everything." Use Pi's package ecosystem to discover shapes, then keep the critical control plane local, testable, and auditable.
