# Contributing

This is a safety-sensitive agent harness. Keep changes reviewable and evidence-backed.

## Local workflow

```bash
npm ci
npm run harness:bootstrap
npm run harness:ready -- --run-gates
```

For non-trivial work:

1. Create or select a harness task.
2. Acquire the writer lock before multi-file implementation.
3. Record progress at meaningful milestones.
4. Run targeted checks, then full gates when appropriate.
5. Write evidence before marking work done.

## Safety rules

- Do not commit credentials, login/session files, `.env*`, `.npmrc`, `.netrc`, SSH keys, or token/auth stores.
- Do not weaken runtime policy to make a task easier.
- Do not install blocked packages unless a valid manual approval record exists.
- Do not enable MCP/subagent tools globally; use narrow task-scoped policy profiles.
- External writes require intent plus proof or cancellation.

## Useful checks

```bash
npm run gates
npm run package:approval -- doctor --json
npm run package:provenance -- --json
npm run package:harness -- doctor --json
npm run smoke:live -- all --dry-run --json
```
