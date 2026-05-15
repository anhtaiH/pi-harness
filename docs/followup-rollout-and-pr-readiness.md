# Pi Harness Followup Rollout and PR Readiness

Generated from local task `finalize-pi-harness-followups-20260513230014`.

## Current readiness

The lab is locally ready for continued trial use as a Pi-based harness control plane. It now has:

- Runtime tool-call policy enforcement for secret paths, destructive shell, and external-write-like commands.
- Expiring task-scoped policy profiles for reviewed MCP/subagent use (`mcp-discovery`, `subagent-review`, and exact `mcp-direct-selected` tools).
- External-write intent/proof/cancel gates.
- Task, evidence, memory, review-lane, package-provenance, writer-lock, secret-scan, and eval finish gates.
- Bounded review-lane dry/live runner with local artifacts.
- Memory import, deduplication, ranking, and doctor checks.
- Dashboard JSON/HTML summaries under `state/status/`.
- Dry-run and live smoke coverage for the core local policy surfaces.

## Live smoke status

- `npm run smoke:live -- all --live --json` passed.
- Live runtime policy smoke returned `Blocked` for a forbidden `.env` read.
- Live oracle subagent lane completed successfully and reported no blocking findings.
- Live MCP discovery reported the MCP gateway is available but this lab currently has `0/0` MCP servers and `0` tools configured.

## Rollout stages

### Stage 0: Keep the lab isolated

Use only this repository and `./bin/pi-harness`. Do not copy files into `~/.agent-harness` or production checkouts.

Required checks before every local release point:

```bash
npm run gates
npm run smoke:live -- all --dry-run --json
npm run package:provenance -- --json
npm run package:harness -- doctor --json
```

### Stage 1: Pilot task-scoped MCP/subagent access

For a real task that needs MCP or subagents:

1. Create or select a harness task.
2. Apply only the narrow profile needed:
   ```bash
   npm run policy:profile -- apply --task <taskId> --profile mcp-discovery --ttl-minutes 120 --clear-on-finish
   npm run policy:profile -- apply --task <taskId> --profile subagent-review --ttl-minutes 120 --clear-on-finish
   npm run policy:profile -- apply --task <taskId> --profile mcp-direct-selected --tools server_docs_search --ttl-minutes 120 --clear-on-finish
   ```
3. Keep a writer lock active for implementation work.
4. Record review-lane findings/provenance when a subagent output influences decisions.
5. Record external-write intent/proof for any external write-like action.
6. Run the finish gate before declaring completion.

### Stage 2: Add real connector profiles one at a time

Before enabling an MCP connector for ongoing use:

- Review its server config and exposed tools without printing credentials.
- Prefer exact direct tool names over wildcard patterns.
- Use `npm run mcp:sandbox -- list --json` for local non-external fixture coverage before trying real connectors.
- Add evals for allowed read-only calls and blocked write/secret-like calls.
- Keep connector-specific caveats in docs and memory.

### Stage 3: Propose production adoption

Production adoption should be a reviewed proposal, not a direct copy. The proposal should include:

- Files to copy or package.
- Migration/rollback steps.
- Local and production smoke commands.
- Owner approval.
- Explicit confirmation that credential paths remain outside prompts, logs, task artifacts, and memory.

## Rollback plan

If a new profile, package, or connector behaves unexpectedly:

1. Clear the task policy profile:
   ```bash
   npm run policy:profile -- clear --task <taskId>
   ```
2. Re-run:
   ```bash
   npm run tool:policy -- doctor --json
   npm run gates
   ```
3. Remove or disable the package/connector only after source-review/provenance notes are updated.
4. Record the rollback in task evidence.

## PR readiness notes

No external PR was opened from this task. If a PR is requested later, open it in draft mode.

Suggested local commit split:

1. Control-plane policy/evidence gates.
2. Memory and review-lane functionality.
3. Smoke/eval/dashboard coverage.
4. Docs and usage guide updates.
5. Followup task/evidence artifacts if task state is intentionally included.

Suggested PR checklist:

- [ ] `npm run gates` passes.
- [ ] `npm run smoke:live -- all --dry-run --json` passes.
- [ ] Secret scan has no findings.
- [ ] Package provenance passes.
- [ ] New task-scoped allowlists are documented and not global defaults.
- [ ] No credential/auth files are included.
- [ ] PR is opened as draft if pushed upstream.
