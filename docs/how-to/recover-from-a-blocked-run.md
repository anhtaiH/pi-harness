# How to Recover From a Blocked Run

A block is not a failure of the harness. It is the harness doing its job.

Do not work around it first. Read it first.

## Secret or protected path block

If the agent tried to read a protected file, stop and ask why.

Usually the right fix is to provide non-secret context manually or point the agent at a safe config example.

Do not paste secrets into chat or task artifacts.

## External-write block

If the agent tried to write to GitHub, Jira, Slack, Confluence, deploy tooling, or a release system, record intent first.

```bash
npm run external-write -- intent --help
```

Inside Pi, use the harness external-write tools.

After the write, record proof. If the write is no longer needed, cancel the intent.

## Package provenance block

Run:

```bash
npm run package:approval -- doctor --json
npm run package:provenance -- --json
```

If a package review is blocked, either remove the package or add a real manual approval. Do not edit the lockfile to make the finding go away.

## Evidence block

Run:

```bash
npm run evidence:doctor -- <taskId> --json
```

Common fixes:

- add a real positive proof
- add a negative or failure-mode check
- explain skipped checks
- record residual risk
- add diff-risk notes

## Writer lock block

If work is done, release the lock.

If another task owns the lock, do not steal it unless it is stale and you understand why.

## Eval block

Run the eval directly if possible. The case id usually points at the broken behavior.

```bash
node scripts/eval-runner.mjs --json
```

Fix the regression or update the eval only if the expected behavior truly changed.

## When to ask the human

Ask when:

- scope expanded
- product behavior is unclear
- a blocked package seems necessary
- an external write is needed
- a deploy or merge is involved
- the same fix failed three times

The harness is there to make these moments visible.
