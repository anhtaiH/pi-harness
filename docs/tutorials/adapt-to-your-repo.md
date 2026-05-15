# Adapt the Harness to Your Repo

Start small. You already have a project repo; adopt the harness there instead of treating this repository as your project.

## 1. Plan adoption

From your project root:

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt
```

This is plan-only. It shows what would be copied into `.pi-harness/` and which npm scripts would be added.

## 2. Apply adoption

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt -- --apply
npm run harness:setup -- --apply --install
npm run pi
```

The sidecar keeps harness code, local state, Pi sessions, and reviewed package artifacts under `.pi-harness/`. Pi still starts in your project root, so file reads/edits target your project.

## 3. Run one tiny real task

Inside Pi:

```text
/harness-new tiny-doc-or-test-cleanup
/skill:harness scope it, make the smallest change, run one check, write evidence, and finish
```

The first adoption should prove the loop, not model your whole company.

## 4. Add project-specific checks later

Start with checks people already trust, then wire them into the harness once the basic flow feels good:

```json
{
  "checks": [
    "npm run typecheck",
    "npm test"
  ]
}
```

Avoid a giant check list at first. If the first run takes 45 minutes, people will skip it.

## 5. Add connectors later

MCP, Jira, Slack, GitHub, deploy tooling, and similar connectors should come after the basic task workflow works.

When you add them:

- classify tools as read-only or write-like
- keep write-like tools gated by external-write intent
- use task-scoped policy profiles
- start with discovery, not mutation

## 6. Decide what to share

For a team rollout, share project-local harness config and examples of good task packets/evidence.

Do not share local sessions, login state, private task history, or company memory entries unless explicitly sanitized.

A good adoption feels boring: setup, start Pi, do a small task, leave proof.
