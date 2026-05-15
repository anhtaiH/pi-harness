# Package Source Review: pi-subagents@0.24.2

- Spec: `npm:pi-subagents@0.24.2`
- Verdict: `trial-ok-after-source-spot-check`
- License: MIT
- Files: 81
- Size: 242742 bytes packed, 969577 bytes unpacked
- Dependencies: 2 runtime, 4 peer
- Tarball: `vendor/npm/pi-subagents-0.24.2.tgz`

## Pi Resources

```json
{
  "manifest": {
    "extensions": [
      "./src/extension/index.ts"
    ],
    "skills": [
      "./skills"
    ],
    "prompts": [
      "./prompts"
    ]
  },
  "conventionDirs": [
    "skills",
    "prompts"
  ]
}
```

## Scripts

- `test`: `npm run test:unit`
- `test:unit`: `node --experimental-strip-types --test test/unit/*.test.ts`
- `test:integration`: `node --experimental-transform-types --import ./test/support/register-loader.mjs --test test/integration/*.test.ts`
- `test:all`: `npm run test:unit && npm run test:integration`

## Lifecycle Scripts

- None found.

## Static Signals

- `CHANGELOG.md`: process execution
- `README.md`: credential path reference
- `install.mjs`: process execution
- `src/agents/agent-management.ts`: filesystem mutation
- `src/agents/agents.ts`: filesystem mutation
- `src/agents/skills.ts`: process execution
- `src/extension/index.ts`: filesystem mutation
- `src/intercom/intercom-bridge.ts`: process execution
- `src/runs/background/async-execution.ts`: process execution
- `src/runs/background/result-watcher.ts`: filesystem mutation
- `src/runs/background/stale-run-reconciler.ts`: filesystem mutation
- `src/runs/background/subagent-runner.ts`: process execution
- `src/runs/foreground/execution.ts`: process execution
- `src/runs/shared/long-running-guard.ts`: filesystem mutation
- `src/runs/shared/pi-args.ts`: filesystem mutation
- `src/runs/shared/run-history.ts`: filesystem mutation
- `src/runs/shared/single-output.ts`: filesystem mutation
- `src/runs/shared/subagent-prompt-runtime.ts`: environment access
- `src/runs/shared/worktree.ts`: process execution
- `src/shared/artifacts.ts`: filesystem mutation
- `src/shared/atomic-json.ts`: filesystem mutation
- `src/shared/formatters.ts`: environment access
- `src/shared/post-exit-stdio-guard.ts`: process execution
- `src/shared/settings.ts`: filesystem mutation
- `src/shared/types.ts`: environment access
- `src/shared/utils.ts`: filesystem mutation
- `src/tui/render-helpers.ts`: environment access

## Notes

- This review uses npm tarball contents and static scanning. It does not prove package safety.
- A Pi package extension still executes arbitrary local code when loaded.
