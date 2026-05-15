# Package Source Review: pi-intercom@0.6.0

- Spec: `npm:pi-intercom@0.6.0`
- Verdict: `trial-ok-after-source-spot-check`
- License: MIT
- Files: 18
- Size: 41492 bytes packed, 173437 bytes unpacked
- Dependencies: 2 runtime, 2 peer
- Tarball: `vendor/npm/pi-intercom-0.6.0.tgz`

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

- `test`: `tsx --test broker/paths.test.ts broker/spawn.test.ts reply-tracker.test.ts intercom.integration.test.ts test/inline-message.test.ts`

## Lifecycle Scripts

- None found.

## Static Signals

- `README.md`: process execution
- `broker/broker.ts`: filesystem mutation
- `broker/paths.ts`: credential path reference
- `broker/spawn.test.ts`: process execution
- `broker/spawn.ts`: process execution
- `config.ts`: process execution
- `index.ts`: process execution
- `package.json`: process execution
- `skills/pi-intercom/SKILL.md`: process execution

## Notes

- This review uses npm tarball contents and static scanning. It does not prove package safety.
- A Pi package extension still executes arbitrary local code when loaded.
