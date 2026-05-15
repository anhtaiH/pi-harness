# Package Source Review: pi-web-access@0.10.7

- Spec: `npm:pi-web-access@0.10.7`
- Verdict: `trial-ok-after-source-spot-check`
- License: MIT
- Files: 32
- Size: 6402712 bytes packed, 6852655 bytes unpacked
- Dependencies: 5 runtime, 0 peer
- Tarball: `vendor/npm/pi-web-access-0.10.7.tgz`

## Pi Resources

```json
{
  "manifest": {
    "extensions": [
      "./index.ts"
    ],
    "skills": [
      "./skills"
    ],
    "video": "https://github.com/nicobailon/pi-web-access/raw/refs/heads/main/pi-web-fetch-demo.mp4"
  },
  "conventionDirs": [
    "skills"
  ]
}
```

## Scripts

- `test`: `node --test`

## Lifecycle Scripts

- None found.

## Static Signals

- `CHANGELOG.md`: process execution
- `README.md`: keychain access
- `chrome-cookies.ts`: process execution
- `curator-page.ts`: network access
- `exa.ts`: filesystem mutation
- `extract.ts`: network access
- `gemini-api.ts`: environment access
- `gemini-search.ts`: credential path reference
- `gemini-url-context.ts`: network access
- `gemini-web-config.ts`: environment access
- `gemini-web.ts`: network access
- `github-api.ts`: process execution
- `github-extract.ts`: process execution
- `index.ts`: process execution
- `pdf-extract.ts`: filesystem mutation
- `perplexity.ts`: environment access
- `test/gemini-web-cookie-opt-in.test.mjs`: process execution
- `test/pdf-extract.test.mjs`: process execution
- `video-extract.ts`: process execution
- `youtube-extract.ts`: process execution

## Notes

- This review uses npm tarball contents and static scanning. It does not prove package safety.
- A Pi package extension still executes arbitrary local code when loaded.
