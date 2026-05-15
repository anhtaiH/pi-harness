# First Run

This tutorial gets the harness running for an existing project without putting harness files in the project repo.

You do not need to understand every concept first. Adopt the local sidecar, run setup, start Pi, and then come back to reference docs when the workflow starts to make sense.

## 1. Plan adoption

From your project root:

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt
```

The first run is plan-only. By default it tells you where the harness would be copied outside the project checkout and confirms that no project files would be written.

## 2. Apply adoption

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt -- --apply
```

This copies the harness to a local sidecar outside the project checkout and prints exact launcher commands. It should not write project files in default local mode.

## 3. Set up the sidecar

Run the setup command printed by adoption. It looks like:

```bash
/path/to/local/pi-harness/.../bin/pi-harness setup --apply --install
```

Setup installs the sidecar lockfile when asked, preferring pnpm via Corepack and falling back to npm if needed. It bootstraps local state, checks harness health, and shows optional model/team/research batteries.

## 4. Start Pi

```bash
/path/to/local/pi-harness/.../bin/pi-harness
```

Inside Pi, run:

```text
/harness-status
```

You should see the local harness status.

## 5. Create a tiny first task

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

Use repo mode:

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt -- --mode repo --apply
npm run harness:setup -- --apply --install
npm run pi
```

Repo mode writes `.pi-harness/` and npm scripts so the team can choose to check the harness in with the project.
