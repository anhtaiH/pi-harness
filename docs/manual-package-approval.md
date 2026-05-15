# Manual Package Approval Workflow

Automated source review stays the default gate. If a package review returns `blocked`, the harness must not install it unless a human records a specific manual approval that accepts the risk.

This workflow is for powerful packages such as CLIs that naturally contain process execution, filesystem mutation, environment access, or local auth/session references.

## Commands

```bash
npm run package:approval -- doctor --json
npm run package:approval -- template --spec npm:@earendil-works/pi-coding-agent@0.74.0 --json
npm run package:provenance -- --json
```

The approval registry is `package-approvals.json`.

## States

- `pending-human-review`: the package is known and tracked, but not approved.
- `approved`: a human has accepted specific risks for a specific package/version/scope/expiry.
- absent approval: blocked packages remain blocked.

## Approval requirements

An approval record must include:

- package spec and exact version
- reviewer identity
- approval and expiry timestamps
- matching source-review verdict
- scope of use
- rationale
- risks accepted
- mitigations
- verification commands
- rollback plan

Approvals expire so powerful packages are reviewed again after time passes or versions change.

## Pi CLI status

`@earendil-works/pi-coding-agent@0.74.0` has an explicit manual approval because automated source review returned `blocked`. The repo pins it through `package.json` to `vendor/npm/earendil-works-pi-coding-agent-0.74.0.tgz`; `vendor/manifest.json` records the checksum and approval id; `package-reviews/earendil-works_pi-coding-agent_0.74.0/review.json` carries the portable review summary.

## Safe path to approve or renew later

1. Read the committed source-review summary under `package-reviews/earendil-works_pi-coding-agent_0.74.0/review.json` and, when changing versions, regenerate local review artifacts under `state/package-reviews` first.
2. Generate a template:
   ```bash
   npm run package:approval -- template --spec npm:@earendil-works/pi-coding-agent@0.74.0 --json
   ```
3. Add a completed approval to `package-approvals.json`.
4. Run:
   ```bash
   npm run package:approval -- doctor --json
   npm run package:provenance -- --json
   npm run harness:ready -- --run-gates
   ```
5. Only then install, update, or vendor the package through a dedicated task.

Do not use this workflow for convenience. Use it only when the package is necessary and the risks are explicitly accepted.
