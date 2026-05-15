# Architecture

Pi Harness is a repo-local control plane around Pi.

In an adopted project, the harness lives in `.pi-harness/` and Pi starts with the project as the working directory. The harness sidecar owns state, prompts, package provenance, policy, and evals.

## Layers

```text
project repo
  package.json scripts -> .pi-harness scripts/bin
  source files         -> Pi reads/edits here

.pi-harness
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

The public adoption path copies a sidecar into an existing project. The source repository remains useful for developing the harness itself, but users should not have to clone it as their project.
