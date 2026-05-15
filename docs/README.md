# Documentation Reference Shelf

Start with the root `README.md`.

This directory is fallback reference. The product path should be adoption into your existing repo, then the launcher printed by adoption:

```bash
/path/to/local/pi-harness/.../bin/pi-harness setup
/path/to/local/pi-harness/.../bin/pi-harness
/path/to/local/pi-harness/.../bin/pi-harness next
```

In repo mode, those commands are available as `npm run harness:setup`, `npm run pi`, and `npm run harness:next`.

If a doc here feels required for first use, that is a UX bug. Prefer improving the wizard, command output, or README.

## Smallest page for the job

- [Command reference](reference/commands.md) — CLI lookup
- [Config and state reference](reference/config-and-state.md) — file layout
- [Core concepts](explanation/core-concepts.md) — vocabulary if the CLI wording is not enough
- [Recover from a blocked run](how-to/recover-from-a-blocked-run.md) — recovery reference

Older explanation, tutorial, rollout, and packaging pages still exist for maintainers, but they are no longer the onboarding path.
