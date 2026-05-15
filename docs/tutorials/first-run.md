# First Run

This tutorial gets the harness running inside an existing project repo.

You do not need to understand every concept first. Adopt the sidecar, run setup, start Pi, and then come back to reference docs when the workflow starts to make sense.

## 1. Plan adoption

From your project root:

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt
```

The first run is plan-only. It tells you what would be copied to `.pi-harness/` and which npm scripts would be added.

## 2. Apply adoption

```bash
npx --yes --package github:anhtaiH/pi-harness pi-harness-adopt -- --apply
```

This adds the sidecar and minimal project scripts. It should not overwrite unrelated project files.

## 3. Set up the sidecar

```bash
npm run harness:setup -- --apply --install
```

Setup installs the sidecar lockfile when asked, bootstraps local state, checks harness health, and shows optional model/team/research batteries.

## 4. Start Pi

```bash
npm run pi
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
npm run harness:ready -- --run-gates --allow-open-tasks
```

Do not use that as a release shortcut. Finish or close real tasks before claiming the harness is ready.
