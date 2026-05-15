# Changelog

## 0.1.0 - Initial private portable harness

- Added repo-local Pi wrapper and isolated Pi state directories.
- Added harness extension tools for tasks, progress, evidence, finish gates, memory, review lanes, external-write intents, provenance, traces, evals, policy profiles, and writer locks.
- Added runtime tool-call policy enforcement inside Pi.
- Added package source-review, manual approval, provenance, and vendored artifact workflows.
- Pinned repo-local Pi CLI via reviewed vendored tarball and explicit manual approval.
- Added clone-and-run bootstrap/readiness UX, capability wizard UX, and CI gate scaffold.
- Added replayable eval suite covering policy, provenance, memory, review lanes, bootstrap, metadata, and portability.
- Added adapter templates and production packaging/rollout documentation.
- Added reviewed/vendored opt-in batteries for subagent teams, intercom, MCP, web/research, and prompt workflow helpers.

Known caveat: normal `npm ci` needs npm registry or company mirror access; fully air-gapped dependency vendoring is intentionally deferred.
