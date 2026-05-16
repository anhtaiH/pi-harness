# Pi Harness

A portable control plane for running Pi as a disciplined coding agent.

The goal is not more documentation. The goal is an agent workflow that teaches itself: safe defaults, clear failure messages, exact next commands, and proof before "done." The harness can live outside your project checkout for personal/local use, or inside `.pi-harness/` when a team wants to version it with the code.

## Start Here

You probably already have a project repo. Start there. The beginner path is one command:

```bash
cd your-project
curl -fsSL https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install | bash
```

That command installs/updates a local harness source copy, connects this project to a **local sidecar**, runs useful setup, and keeps project writes off by default. No Pi/harness code, installs, sessions, auth, or package cache need to be committed to your repo.

After setup, use the short loop from the project:

```bash
ph        # open Pi in this project
ph next   # ask what to do next
ph done   # finish with evidence and gates
```

If your terminal cannot find `ph`, the installer prints a direct launcher fallback under `Next:`. No `source state/setup/...` step is required.

Inside Pi, the front door is:

```text
/harness
```

Use `/harness` whenever you do not know what the harness can do. It exposes tasks, finish flow, models/login, local LLMs, team/research tools, memory review, statusline controls, and a task brief builder without making you remember paths or environment variables.

Advanced/CI-friendly equivalents still exist:

```bash
/path/to/local/pi-harness/projects/your-project-abc123/bin/pi-harness start
/path/to/local/pi-harness/projects/your-project-abc123/bin/pi-harness setup --apply --install --alias ph --checks-profile standard
```

If you want npm scripts and are comfortable putting harness entry points in the project, choose repo mode explicitly:

```bash
/path/to/pi-harness/bin/pi-harness start --mode repo
npm run pi
```

Repo mode copies the harness into `.pi-harness/` and adds a small set of npm scripts to your existing `package.json`. Local mode writes no project files by default; add `--scripts package-json` only if you intentionally want package scripts pointing at your local harness.

The setup wizard installs the harness lockfile when asked, preferring fast pnpm via Corepack and falling back to npm when needed. It bootstraps local state, shows optional model/team/research batteries, detects project checks with a confidence/profile model, writes `state/setup/latest.json` under the harness root, writes a day-two cheatsheet, and generates handoff prompts so you can ask Pi to continue with the exact handoff visible.

Inside Pi, ask naturally or use the built-in front door:

```text
/harness
/harness-brief
```

`/harness-brief` is the task-shaping escape hatch: Pi asks a few targeted questions, creates a scoped task packet, and suggests verification before edits begin.

Do not read the whole harness repo first. Start from your project and let the harness show the next safe step.

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

Most days should only need:

```bash
ph next     # ask "what should I do next?"
ph          # start Pi in your project with harness guardrails
ph done     # evidence + review policy + finish gates
```

Need more? Do not memorize flags:

```bash
ph more       # plain-language capability menu
ph models     # open Pi with /login + /model guidance
ph local-llm  # Ollama / LM Studio guidance
ph team       # open Pi with team/subagent tools available
ph research   # open Pi with research/MCP tools available
ph memory     # memory review from inside Pi
ph brief      # task-shaping flow from inside Pi
```

In repo mode, the same loop is available as `npm run harness:setup`, `npm run pi`, `npm run harness:next`, and `npm run harness:done`.

Advanced checks still exist for CI and maintainers, but they should not be the onboarding path. You do not need to install pnpm first; setup chooses the best available locked install path.

## The In-Pi Interface

Most of the product is inside Pi, not in docs. The harness adds:

- `/harness` — command center for tasks, models, local LLMs, team/research tools, memory, statusline, and help
- `/harness-brief` — task-shaping flow when the human only has a fuzzy goal
- `/harness-memory` — review/forget/prune persistent memory so bad rules do not live forever
- `/harness-local-llm` — detect/register Ollama or LM Studio models for low-risk work
- `/harness-statusline` — explain or toggle the richer footer/statusline

The default statusline shows the current project, task/risk, writer lock, eval/check signal, memory risk, capability mode, model, git branch, and `/harness` as the escape hatch.

If something fails, the CLI should answer four questions:

1. what failed?
2. why does it matter?
3. what exact command should I try next?
4. what is safe to ignore only for a local pilot?

That is the product surface. The docs are reference material, not the onboarding path.

## Agent-Driven Setup

The harness should behave like Pi extensions do: ask the agent to improve the system, and the system makes the safe path obvious.

The setup command is the transparent wizard (`.../bin/pi-harness setup` in local mode, `npm run harness:setup` in repo mode):

- **inspect**: show local facts such as Node, lockfile, installed dependencies, local Pi, detected project checks, and optional batteries
- **apply**: with `--apply`, automate safe local boilerplate, project-check adapter generation, alias snippets, and a day-two cheatsheet instead of asking a human to copy steps
- **choose**: with `--interactive`, ask for apply/install/check-profile/alias/gates choices without editing shell rc files
- **verify**: run fast checks, project-check doctors, saved project-check profiles, or full gates with `--run-gates`
- **hand off**: generate Pi prompts that say what happened and how the agent should continue

Nothing external is hidden in the wizard. Risky work still needs the normal harness gates.

## Batteries Included, Still Safe By Default

Pi is intentionally skeletal. This harness chooses a practical starter kit and makes each extra battery just-in-time instead of global magic.

| Battery | Included here | How to use it |
| --- | --- | --- |
| Local/repo Pi CLI | yes, pinned and reviewed/manual-approved | run the printed `.../bin/pi-harness` launcher, or `npm run pi` in repo mode |
| Model/login guidance | yes, just-in-time | `ph models`, then `/login` and `/model` inside Pi |
| Local LLMs | yes, guided | `ph local-llm` or `/harness-local-llm` for Ollama/LM Studio detection |
| Subagent teams | yes, `pi-subagents` reviewed/vendored | `ph team`, then `/harness-team` and `/subagents-doctor` |
| Parent-child coordination | yes, `pi-intercom` reviewed/vendored | included in team mode when child agents need decisions |
| MCP adapter | yes, `pi-mcp-adapter` reviewed/vendored | `ph research`, then `/harness-research` and `/mcp setup` |
| Web/research tools | yes, `pi-web-access` reviewed/vendored | `ph research`, then ask for source-cited docs research |
| Prompt workflow helpers | yes, `pi-prompt-template-model` reviewed/vendored | available in team/research flows for reusable prompts |

Default Pi launch loads only the harness extension/skill. The friendly commands (`ph team`, `ph research`, `ph local-llm`) turn on the extra session mode for you; environment variables remain an implementation detail, not something beginners need to remember.

Why not load everything by default? Because these packages can add tools, run extension code, touch the network, or orchestrate child agents. The harness makes them available, reviewed, and just-in-time while preserving a small safe default.

Vendored here means the reviewed artifact and checksum are committed for provenance. A first team/research session may still install the pinned package into the ignored project package cache if it is not already present locally.

## Models, Teams, and Research

You do not install Claude Code or ChatGPT Pro into the harness. You authenticate Pi to providers.

Inside Pi:

```text
/login
/model
```

The setup wizard and `/harness` command center show the model, local LLM, team, and research choices when they matter. You should not need to memorize separate setup commands or internal paths.

Recommended agent-team loop for non-trivial work:

```text
scout -> planner -> worker -> reviewer -> oracle if risky
```

The harness keeps subagent and MCP tools behind task-scoped policy profiles. Ask Pi to apply the relevant profile for the active task before live delegation.

## What the Harness Prevents

The harness is deliberately boring where agents are usually risky:

- no unscoped work: start from a task packet
- no invisible progress: record useful checkpoints
- no "trust me" finish: use the done flow to run project checks, review policy, evidence, and finish gates
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

## How Project Connection Works

The friendly `start` flow does not replace your repo. The older `pi-harness-adopt` command remains as a compatibility alias for automation. The harness supports two placements:

```text
Local mode, default:
  your-project/                       no harness files required
  ~/.../pi-harness/projects/<id>/     harness code, checks, prompts, reviewed packages, state

Repo mode, explicit choice:
  your-project/
    package.json                      small npm-script additions
    .pi-harness/                      harness code, checks, prompts, reviewed packages
      state/                          local task/evidence/session state
```

Both modes start Pi with your project as the working directory and the sidecar as the harness/control-plane directory. Local mode records the project path in `harness.project.json` inside the local sidecar; repo mode infers the project from `.pi-harness/..`.

The Pi CLI is pinned inside the sidecar through the harness `package.json` to:

```text
vendor/npm/earendil-works-pi-coding-agent-0.74.0.tgz
```

The automated source review for that CLI is intentionally recorded as `blocked` because it is a powerful local agent CLI. This repo carries a human approval, committed review summary, vendored checksum, and provenance enforcement instead of hiding that risk.

## Safety Boundaries

Do not commit or read credential-bearing local files. Do not paste their content into prompts, docs, task artifacts, or memory.

Generated harness state lives under `state/` inside the selected harness root. In local mode that root is outside your project checkout. In repo mode it is `.pi-harness/state/` and runtime state is ignored except placeholder files. Pi login/session data lives in ignored local sidecar state.

## Contributor Path

Clone this repository only if you want to develop the harness itself:

```bash
git clone https://github.com/anhtaiH/pi-harness.git
cd pi-harness
npm run harness:setup -- --apply --install --run-gates
node scripts/harnessctl.mjs ready --run-gates --json
```

The user path is connecting the harness to an existing project. The clone path is for harness contributors.

This is clone-and-run portable with normal npm access. It is not fully air-gapped/offline; full offline support would require vendoring or mirroring the full transitive npm dependency closure.

## Repository Layout

```text
.pi/                         Pi extension, skill, prompts, safe subagents, settings
bin/                         local/repo launchers and bootstrap helper
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

Current local baseline: local-only and repo-contained project connection flows passing, sidecar Pi wrapper supported, pinned Pi CLI, pnpm-first setup, and the eval suite passing.
