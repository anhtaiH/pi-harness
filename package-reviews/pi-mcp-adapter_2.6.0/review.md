# Package Source Review: pi-mcp-adapter@2.6.0

- Spec: `npm:pi-mcp-adapter@2.6.0`
- Verdict: `trial-ok-after-source-spot-check`
- License: MIT
- Files: 43
- Size: 1312559 bytes packed, 1835136 bytes unpacked
- Dependencies: 7 runtime, 1 peer
- Tarball: `vendor/npm/pi-mcp-adapter-2.6.0.tgz`

## Pi Resources

```json
{
  "manifest": {
    "extensions": [
      "./index.ts"
    ],
    "video": "https://github.com/nicobailon/pi-mcp-adapter/raw/refs/heads/main/pi-mcp.mp4"
  },
  "conventionDirs": []
}
```

## Scripts

- `test`: `vitest run`
- `test:watch`: `vitest`
- `test:coverage`: `vitest run --coverage`
- `test:oauth-provider`: `node --import tsx --test mcp-oauth-provider.test.ts`

## Lifecycle Scripts

- None found.

## Static Signals

- `agent-dir.ts`: environment access
- `app-bridge.bundle.js`: filesystem mutation
- `cli.js`: filesystem mutation
- `config.ts`: filesystem mutation
- `glimpse-ui.ts`: process execution
- `host-html-template.ts`: network access
- `index.ts`: environment access
- `init.ts`: environment access
- `logger.ts`: environment access
- `mcp-auth.ts`: filesystem mutation
- `mcp-oauth-provider.ts`: environment access
- `metadata-cache.ts`: filesystem mutation
- `npx-resolver.ts`: process execution
- `oauth-handler.ts`: environment access
- `onboarding-state.ts`: filesystem mutation
- `server-manager.ts`: environment access
- `ui-session.ts`: environment access
- `utils.ts`: process execution

## Notes

- This review uses npm tarball contents and static scanning. It does not prove package safety.
- A Pi package extension still executes arbitrary local code when loaded.
