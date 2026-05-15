# Security

This repository is designed to keep agent behavior explicit and local by default.

## Do not commit

- `.pi-agent/`
- `state/sessions/`
- `.env*`
- `.npmrc`
- `.netrc`
- SSH keys
- auth/token stores
- generated task/session/tmp/log state unless explicitly sanitized

## Reporting issues

For this private repo, open a private issue or contact the repository owner directly.

## Safety gates

Before sharing or deploying changes, run:

```bash
npm run harness:ready -- --run-gates
npm run package:approval -- doctor --json
npm run package:provenance -- --json
npm run package:harness -- doctor --json
```

## Package policy

Automated source review remains the default gate. A blocked review may only be accepted with an explicit, expiring manual approval record in `package-approvals.json`, plus committed review metadata and package provenance.
