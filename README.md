# Pi Harness

A portable, repo-contained control plane for running Pi as a disciplined coding agent.

The goal is not more documentation. The goal is an agent workflow that teaches itself: safe defaults, clear failure messages, exact next commands, and proof before "done."

## Start Here

You probably already have a project repo. Start there.

```bash
cd your-project
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt          # show the plan, no writes
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt -- --apply
npm run harness:setup -- --apply --install
npm run pi
```

Adoption copies the harness into `.pi-harness/` as a sidecar and adds a small set of npm scripts to your existing `package.json`. Your project stays the working directory; harness state, sessions, package cache, and local Pi login stay under `.pi-harness/`.

If you are already inside an adopted project, the daily path is simply:

```bash
npm run harness:setup
npm run pi
```

The setup wizard installs the sidecar lockfile when asked, bootstraps local state, shows optional model/team/research batteries, runs checks, writes `.pi-harness/state/setup/latest.json`, and generates handoff prompts under `.pi-harness/state/setup/` so you can ask Pi to continue with the exact handoff visible.

Inside Pi, hand over the generated prompt or ask for one small real task:

```text
/harness-new tiny-doc-or-test-cleanup
/skill:harness scope it, make the smallest change, run one check, write evidence, and finish
```

Do not read the whole harness repo first. Run the wizard from your project and let the harness show the next safe step.

## The Whole Mental Model

```text
brief -> work -> proof -> gate
```

In harness terms:

- **brief** = task packet: the written boundary for the work
- **work** = edits plus a short progress trail
- **proof** = evidence: what passed, what failed safely, what risk remains
- **gate** = finish gate: the final local check before done means done

You should learn these by doing. `npm run harness:learn` prints the current state, the next command, and the small concept that matters right now.

## Daily Loop

Most days, from your project repo, should only need this:

```bash
npm run harness:setup      # guided setup/checks; add --apply when you want it to write local handoffs
npm run pi                 # start Pi in your project with harness guardrails
npm run harness:next       # ask "what should I do next?"
```

Advanced checks still exist for CI and maintainers, but they should not be the onboarding path.

If something fails, the CLI should answer four questions:

1. what failed?
2. why does it matter?
3. what exact command should I try next?
4. what is safe to ignore only for a local pilot?

That is the product surface. The docs are reference material, not the onboarding path.

## Agent-Driven Setup

The harness should behave like Pi extensions do: ask the agent to improve the system, and the system makes the safe path obvious.

`npm run harness:setup` is the transparent wizard:

- **inspect**: show local facts such as Node, lockfile, installed dependencies, repo-local Pi, and optional batteries
- **apply**: with `--apply`, automate safe local boilerplate instead of asking a human to copy steps
- **verify**: run fast checks, or full gates with `--run-gates`
- **hand off**: generate Pi prompts that say what happened and how the agent should continue

Nothing external is hidden in the wizard. Risky work still needs the normal harness gates.

## Batteries Included, Still Safe By Default

Pi is intentionally skeletal. This harness chooses a practical starter kit and makes each battery opt-in instead of global magic.

| Battery | Included here | How to use it |
| --- | --- | --- |
| Repo-local Pi CLI | yes, pinned and reviewed/manual-approved | `npm run pi` |
| Model/login guidance | yes, inside setup | `npm run harness:setup`, then `/login` and `/model` inside Pi |
| Subagent teams | yes, `pi-subagents` reviewed/vendored | `PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 npm run pi`, then `/subagents-doctor` |
| Parent-child coordination | yes, `pi-intercom` reviewed/vendored | use with subagents when child agents need decisions |
| MCP adapter | yes, `pi-mcp-adapter` reviewed/vendored | enable packages, then `/mcp setup` |
| Web/research tools | yes, `pi-web-access` reviewed/vendored | enable packages, then ask `researcher` for sourced research |
| Prompt workflow helpers | yes, `pi-prompt-template-model` reviewed/vendored | enable packages when you want reusable model/subagent prompts |

Default `npm run pi` loads only the harness extension/skill. To load optional batteries for a session:

```bash
PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 npm run pi
```

Why not load everything by default? Because these packages can add tools, run extension code, touch the network, or orchestrate child agents. The harness makes them available, reviewed, and easy to turn on while preserving a small safe default.

Vendored here means the reviewed artifact and checksum are committed for provenance. A first opt-in session may still install the pinned package into the ignored project package cache if it is not already present locally.

## Models, Teams, and Research

You do not install Claude Code or ChatGPT Pro into the harness. You authenticate Pi to providers.

Inside Pi:

```text
/login
/model
```

`npm run harness:setup` shows the model, team, and research choices when they matter. You should not need to memorize separate setup commands.

Recommended agent-team loop for non-trivial work:

```text
scout -> planner -> worker -> reviewer -> oracle if risky
```

The harness keeps subagent and MCP tools behind task-scoped policy profiles. Ask Pi to apply the relevant profile for the active task before live delegation.

## What the Harness Prevents

The harness is deliberately boring where agents are usually risky:

- no unscoped work: start from a task packet
- no invisible progress: record useful checkpoints
- no "trust me" finish: write evidence and pass finish gates
- no accidental credential exposure: protected local paths stay blocked
- no quiet GitHub/Jira/Slack/Confluence writes: external writes need intent and proof
- no permanent tool expansion: MCP/subagent permissions are narrow, task-scoped, and expiring
- no mystery package behavior: reviewed/vendored package provenance is enforced
- no two agents editing at once: use the writer lock for implementation work

## Common Failure Modes

| Symptom | Meaning | Next move |
| --- | --- | --- |
| `open task(s)` | Work is unfinished. | `npm run harness:next`, then finish or explicitly allow open tasks for a local pilot. |
| `writer lock active` | One session owns edits. | Release the writer lock after verification, then rerun readiness. |
| `open external-write intent(s)` | A planned outside-the-repo write lacks proof or cancellation. | `npm run external-write -- doctor --json` |
| `package provenance` fails | Installed package behavior does not match reviewed/vendored metadata. | `npm run package:provenance -- --json` |
| `secret-scan` fails | Sensitive material entered tracked or reviewed files. | Remove it; do not paste it into chat or task evidence. |

## How Adoption Works

`pi-harness-adopt` does not replace your repo. It adds a sidecar:

```text
your-project/
  package.json              small npm-script additions
  .pi-harness/              harness code, checks, prompts, reviewed packages
    state/                  local task/evidence/session state
    local-pi-state/         ignored local Pi login/session data
```

`npm run pi` starts Pi with your project as the working directory and `.pi-harness/` as the harness/control-plane directory.

The Pi CLI is pinned inside the sidecar through `.pi-harness/package.json` to:

```text
vendor/npm/earendil-works-pi-coding-agent-0.74.0.tgz
```

The automated source review for that CLI is intentionally recorded as `blocked` because it is a powerful local agent CLI. This repo carries a human approval, committed review summary, vendored checksum, and provenance enforcement instead of hiding that risk.

## Safety Boundaries

Do not commit or read credential-bearing local files. Do not paste their content into prompts, docs, task artifacts, or memory.

Generated harness state lives under `.pi-harness/state/` in an adopted project and is ignored except placeholder files. Pi login/session data lives in ignored local sidecar state.

## Contributor Path

Clone this repository only if you want to develop the harness itself:

```bash
git clone https://github.com/anhtaiH/pi-harness.git
cd pi-harness
npm run harness:setup -- --apply --install --run-gates
node scripts/harnessctl.mjs ready --run-gates --json
```

The user path is adoption into an existing project. The clone path is for harness contributors.

This is clone-and-run portable with normal npm access. It is not fully air-gapped/offline; full offline support would require vendoring or mirroring the full transitive npm dependency closure.

## Repository Layout

```text
.pi/                         Pi extension, skill, prompts, safe subagents, settings
bin/                         repo-local wrappers and bootstrap helper
scripts/                     harness control-plane CLIs and evals
evals/                       replayable policy/provenance/regression cases
docs/                        reference shelf, not required onboarding
adapters/                    project adapter templates
package-reviews/             committed source-review summaries
vendor/                      reviewed package artifacts and checksums
state/                       generated local state; ignored except placeholders
```

## When You Need Reference Docs

Stay on this README until you are blocked. Then use the smallest reference page:

- [Command reference](docs/reference/commands.md) for CLI lookup
- [Config and state reference](docs/reference/config-and-state.md) for file layout
- [Docs index](docs/README.md) for older reference material

The design target is that these pages shrink over time as the CLI, errors, and guided workflow get better.

## CI

`.github/workflows/pi-harness-gates.yml` runs bootstrap, gates, dry live-smoke checks, and package manifest validation on pushes and PRs.

Current local baseline: project-adoption flow passing, sidecar Pi wrapper supported, repo-local Pi CLI pinned, and the eval suite passing.
