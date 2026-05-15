# How to Add a Connector or MCP Surface

Connectors are where agent work can leak out of the repo. Treat them with care.

Start read-only. Prove discovery first. Add write-like tools later.

## 1. Describe the tool

Add metadata for each tool:

- name
- owner
- description
- read-only or write-like
- whether it mutates an external system

Run:

```bash
npm run tool:policy -- metadata --json
```

## 2. Use the sandbox first

Before touching a real connector, test the policy shape with local fixtures:

```bash
npm run mcp:sandbox -- list --json
npm run smoke:live -- all --dry-run --json
```

## 3. Keep access task-scoped

Do not enable broad MCP or subagent access globally.

Use a profile:

```bash
npm run policy:profile -- apply --task <taskId> --profile mcp-discovery --ttl-minutes 60 --clear-on-finish
```

For direct MCP tools, prefer exact selected tools over wildcards.

## 4. Treat writes as external writes

If a tool comments, transitions, posts, deploys, merges, releases, or changes a remote system, it needs intent and proof.

The flow is:

1. record intent
2. perform the write
3. read it back
4. record proof

## 5. Finish with the profile closed

Run:

```bash
npm run policy:profile -- doctor --json
npm run external-write -- doctor --task <taskId> --json
npm run harness:ready -- --run-gates
```

Expired profiles and open external-write intents should block readiness.
