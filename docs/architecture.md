# Architecture

Pi Harness is a portable control plane around Pi.

In an adopted project, Pi starts with the project as the working directory while the harness root can live either outside the checkout (default local mode) or inside `.pi-harness/` (repo mode). The harness sidecar owns state, prompts, package provenance, policy, and evals.

## Layers

```text
project repo
  source files         -> Pi reads/edits here
  package.json scripts -> optional; repo mode or --scripts package-json

local harness root or .pi-harness/
  harness.project.json -> local-mode pointer back to the project root
  bin/pi-harness       -> launcher and setup/next/check wrapper
  .pi/extensions/      -> harness tools and runtime policy
  .pi/skills/          -> task/evidence workflow instructions
  scripts/             -> setup, finish gates, policy, provenance, evals
  state/               -> local generated task/proof/session state
  vendor/              -> reviewed package artifacts/checksums
```

## Core loop

```text
brief -> work -> proof -> gate
```

- task packet records scope
- progress records meaningful checkpoints
- evidence records checks, skipped checks, residual risk, and memory candidates
- finish gates validate evidence, policy, package provenance, memory, review lanes, external writes, writer locks, secret scans, and evals

## Safety model

- Secret-bearing paths are denied.
- External write-like actions require local intent and read-back proof.
- Package/MCP/subagent power stays reviewed, provenance-tracked, and task-scoped.
- One writer owns implementation work at a time.
- Optional batteries are opt-in at runtime.

## Portability model

The public adoption path copies a sidecar for an existing project. Local mode copies it outside the checkout and writes no project files. Repo mode copies it to `.pi-harness/` and adds npm scripts so a team can review and commit it. The source repository remains useful for developing the harness itself, but users should not have to clone it as their project.
