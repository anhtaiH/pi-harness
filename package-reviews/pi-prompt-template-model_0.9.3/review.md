# Package Source Review: pi-prompt-template-model@0.9.3

- Spec: `npm:pi-prompt-template-model@0.9.3`
- Verdict: `trial-ok-after-source-spot-check`
- License: MIT
- Files: 24
- Size: 1299858 bytes packed, 1550754 bytes unpacked
- Dependencies: 1 runtime, 0 peer
- Tarball: `vendor/npm/pi-prompt-template-model-0.9.3.tgz`

## Pi Resources

```json
{
  "manifest": {
    "extensions": [
      "./index.ts"
    ],
    "skills": [
      "./skills"
    ]
  },
  "conventionDirs": [
    "skills"
  ]
}
```

## Scripts

- `test`: `tsx --test test/**/*.test.ts`

## Lifecycle Scripts

- None found.

## Static Signals

- `deterministic-step.ts`: process execution
- `prompt-loader.ts`: credential path reference
- `subagent-runtime.ts`: environment access
- `subagent-step.ts`: environment access
- `tool-manager.ts`: filesystem mutation

## Notes

- This review uses npm tarball contents and static scanning. It does not prove package safety.
- A Pi package extension still executes arbitrary local code when loaded.
