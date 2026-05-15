# Package Source Review: @earendil-works/pi-coding-agent@0.74.0

- Spec: `npm:@earendil-works/pi-coding-agent@0.74.0`
- Verdict: `blocked`
- License: MIT
- Files: 711
- Size: 4564493 bytes packed, 11236386 bytes unpacked
- Dependencies: 21 runtime, 0 peer
- Tarball: `vendor/npm/earendil-works-pi-coding-agent-0.74.0.tgz`

## Pi Resources

```json
{
  "manifest": {},
  "conventionDirs": []
}
```

## Scripts

- `clean`: `shx rm -rf dist`
- `dev`: `tsgo -p tsconfig.build.json --watch --preserveWatchOutput`
- `build`: `tsgo -p tsconfig.build.json && shx chmod +x dist/cli.js && npm run copy-assets`
- `build:binary`: `npm --prefix ../tui run build && npm --prefix ../ai run build && npm --prefix ../agent run build && npm run build && bun build --compile ./dist/bun/cli.js --outfile dist/pi && npm run copy-binary-assets`
- `copy-assets`: `shx mkdir -p dist/modes/interactive/theme && shx cp src/modes/interactive/theme/*.json dist/modes/interactive/theme/ && shx mkdir -p dist/modes/interactive/assets && shx cp src/modes/interactive/assets/*.png dist/modes/interactive/assets/ && shx mkdir -p dist/core/export-html/vendor && shx cp src/core/export-html/template.html src/core/export-html/template.css src/core/export-html/template.js dist/core/export-html/ && shx cp src/core/export-html/vendor/*.js dist/core/export-html/vendor/`
- `copy-binary-assets`: `shx cp package.json dist/ && shx cp README.md dist/ && shx cp CHANGELOG.md dist/ && shx mkdir -p dist/theme && shx cp src/modes/interactive/theme/*.json dist/theme/ && shx mkdir -p dist/assets && shx cp src/modes/interactive/assets/*.png dist/assets/ && shx mkdir -p dist/export-html/vendor && shx cp src/core/export-html/template.html dist/export-html/ && shx cp src/core/export-html/vendor/*.js dist/export-html/vendor/ && shx cp -r docs dist/ && shx cp -r examples dist/ && shx cp ../../node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm dist/`
- `test`: `vitest --run`
- `prepublishOnly`: `npm run clean && npm run build`

## Lifecycle Scripts

- `prepublishOnly`: `npm run clean && npm run build`

## Static Signals

- `CHANGELOG.md`: process execution
- `README.md`: process execution
- `dist/bun/restore-sandbox-env.d.ts`: environment access
- `dist/bun/restore-sandbox-env.js`: environment access
- `dist/cli.js`: environment access
- `dist/config.d.ts`: credential path reference
- `dist/config.js`: process execution
- `dist/core/agent-session-services.js`: credential path reference
- `dist/core/agent-session.js`: filesystem mutation
- `dist/core/auth-storage.d.ts`: credential path reference
- `dist/core/auth-storage.js`: filesystem mutation
- `dist/core/bash-executor.js`: process execution
- `dist/core/exec.d.ts`: process execution
- `dist/core/exec.js`: process execution
- `dist/core/export-html/ansi-to-html.js`: process execution
- `dist/core/export-html/index.js`: filesystem mutation
- `dist/core/export-html/template.js`: process execution
- `dist/core/export-html/vendor/highlight.min.js`: process execution
- `dist/core/export-html/vendor/marked.min.js`: process execution
- `dist/core/extensions/loader.js`: process execution
- `dist/core/extensions/types.d.ts`: process execution
- `dist/core/footer-data-provider.js`: process execution
- `dist/core/model-registry.js`: environment access
- `dist/core/package-manager.js`: process execution
- `dist/core/prompt-templates.js`: credential path reference
- `dist/core/resolve-config-value.js`: process execution
- `dist/core/resource-loader.js`: credential path reference
- `dist/core/sdk.d.ts`: credential path reference
- `dist/core/sdk.js`: credential path reference
- `dist/core/session-manager.js`: filesystem mutation
- `dist/core/settings-manager.js`: filesystem mutation
- `dist/core/skills.js`: credential path reference
- `dist/core/telemetry.js`: environment access
- `dist/core/timings.js`: environment access
- `dist/core/tools/bash.d.ts`: process execution
- `dist/core/tools/bash.js`: process execution
- `dist/core/tools/edit.d.ts`: filesystem mutation
- `dist/core/tools/edit.js`: filesystem mutation
- `dist/core/tools/find.js`: process execution
- `dist/core/tools/grep.js`: process execution
- `dist/core/tools/path-utils.js`: credential path reference
- `dist/core/tools/render-utils.js`: credential path reference
- `dist/core/tools/write.d.ts`: filesystem mutation
- `dist/core/tools/write.js`: filesystem mutation
- `dist/main.js`: environment access
- `dist/migrations.d.ts`: credential path reference
- `dist/migrations.js`: filesystem mutation
- `dist/modes/interactive/components/extension-editor.js`: process execution
- `dist/modes/interactive/components/footer.js`: environment access
- `dist/modes/interactive/components/login-dialog.js`: process execution
- `dist/modes/interactive/components/session-selector.js`: process execution
- `dist/modes/interactive/components/tree-selector.js`: environment access
- `dist/modes/interactive/interactive-mode.d.ts`: credential path reference
- `dist/modes/interactive/interactive-mode.js`: process execution
- `dist/modes/interactive/theme/theme.js`: environment access
- `dist/modes/rpc/rpc-client.js`: process execution
- `dist/package-manager-cli.js`: process execution
- `dist/utils/child-process.d.ts`: process execution
- `dist/utils/clipboard-image.js`: process execution
- `dist/utils/clipboard-native.js`: environment access
- `dist/utils/clipboard.js`: process execution
- `dist/utils/shell.js`: process execution
- `dist/utils/tools-manager.js`: process execution
- `dist/utils/version-check.js`: environment access
- `docs/custom-provider.md`: credential path reference
- `docs/extensions.md`: process execution
- `docs/models.md`: keychain access
- `docs/packages.md`: process execution
- `docs/providers.md`: credential path reference
- `docs/quickstart.md`: credential path reference
- `docs/rpc.md`: process execution
- `docs/sdk.md`: process execution
- `docs/settings.md`: process execution
- `examples/extensions/README.md`: filesystem mutation
- `examples/extensions/auto-commit-on-exit.ts`: process execution
- `examples/extensions/bash-spawn-hook.ts`: process execution
- `examples/extensions/border-status-editor.ts`: process execution
- `examples/extensions/custom-provider-anthropic/index.ts`: network access
- `examples/extensions/custom-provider-gitlab-duo/index.ts`: network access
- `examples/extensions/custom-provider-gitlab-duo/test.ts`: credential path reference

## Notes

- This review uses npm tarball contents and static scanning. It does not prove package safety.
- A Pi package extension still executes arbitrary local code when loaded.
