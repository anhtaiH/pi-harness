# Portability Model

Portability here means a fresh clone can run the same harness workflow without relying on someone else's global agent setup.

It does not mean air-gapped install. That is a different, heavier target.

## What clone-and-run means

A new machine should be able to do this:

```bash
git clone <repo>
cd pi-harness
npm ci
npm run harness:bootstrap
npm run harness:ready -- --run-gates
npm run pi
```

That path should use repo-local behavior:

- repo-local Pi CLI from `node_modules/.bin/pi`
- harness extension under `.pi/extensions/harness`
- harness skill under `.pi/skills/harness`
- local state under `state/`
- local Pi agent state under `.pi-agent/`
- committed review/provenance metadata
- committed evals and docs

## What is committed

The repo commits the parts that define behavior:

- wrappers in `bin/`
- harness extension, skill, prompts, agents, and settings in `.pi/`
- scripts and evals
- docs and adapters
- package approvals and provenance locks
- source-review summaries in `package-reviews/`
- vendored top-level artifacts in `vendor/`
- empty state placeholders

## What stays local

The repo does not commit live work state:

- task history
- sessions
- traces
- temporary files
- local package review extraction state
- policy audit logs
- memory entries unless intentionally sanitized
- login artifacts

Those are useful locally. They are not portable defaults.

## Vendored artifacts

The repo vendors a few important tarballs, including the Pi CLI. `vendor/manifest.json` records checksums and review verdicts.

This does not mean every transitive npm dependency is vendored. `npm ci` still expects normal npm registry access or a company mirror.

That is the right tradeoff for now. Full offline support would add a lot of weight and maintenance.

## Optional Pi packages

`.pi/settings.json` lists optional project Pi packages such as MCP and subagent support. A clean clone may not have `.pi/npm` hydrated yet.

Package provenance handles this by accepting reviewed, vendored artifacts when local `.pi/npm` is absent. The default wrapper still does not load those packages unless you opt in.

```bash
PI_HARNESS_ENABLE_PROJECT_PACKAGES=1 npm run pi
```

## The rule of thumb

If a file defines how the harness behaves, it should be committed.

If a file records what happened in one local run, it should usually stay ignored.
