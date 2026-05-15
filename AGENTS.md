# Pi Harness Lab Instructions

This repository is a local prototype for a portable agent harness built on Pi.

- Keep all credentials outside tracked files.
- Do not read or print auth files, `.env*`, `.npmrc`, SSH keys, or token stores.
- Use `state/tasks/<task-id>/packet.md` before non-trivial work.
- Record progress in `state/tasks/<task-id>/progress.md`.
- Finish with `state/tasks/<task-id>/evidence.md` before claiming completion.
- Prefer project-local Pi resources under `.pi/` over global config.
- Use `bin/pi-harness` so `PI_CODING_AGENT_DIR` and sessions stay isolated inside this lab.

