# First Run

This tutorial gets the harness running for an existing project without putting harness files in the project repo.

You do not need to understand every concept first. Run one command from your project, then use `ph` and `/harness`.

## 1. Install and connect

From your project root:

```bash
curl -fsSL https://raw.githubusercontent.com/anhtaiH/pi-harness/main/bin/install | bash
```

This installs or updates a local harness source copy, connects your project to a local sidecar, runs setup, and keeps project writes off by default.

## 2. Start Pi

```bash
ph
```

If your terminal cannot find `ph`, use the direct launcher printed under `Next:` by the installer.

Inside Pi, run:

```text
/harness
```

You should see the local command center.

## 3. Create a tiny first task

```text
/harness-new inspect-readme
```

Then ask:

```text
Use the harness workflow. Read the README and tell me what this repo does. Do not edit files.
```

This first task is intentionally small. The point is to see the harness loaded, the task active, and the agent working inside your project with local guardrails.

## If Pi asks you to log in

That is normal. Run `/login` inside Pi and follow the provider flow. Login state stays local and ignored.

## If readiness fails because an old task is open

For local exploration, you can run:

```bash
/path/to/local/pi-harness/.../bin/pi-harness ready --run-gates --allow-open-tasks
```

Do not use that as a release shortcut. Finish or close real tasks before claiming the harness is ready.

## If you want repo-contained adoption instead

Use repo mode explicitly:

```bash
ph start --mode repo
npm run pi
```

Repo mode writes `.pi-harness/` and npm scripts so the team can choose to check the harness in with the project.
