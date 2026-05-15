# Vendor Directory

This repo vendors the package artifacts needed to make Pi harness provenance inspectable from a fresh clone.

Rules:

- Vendor only source-reviewed artifacts.
- Record spec, tarball path, checksum, review verdict, and review directory in `vendor/manifest.json`.
- Do not vendor generated state, local sessions, or private material.
- Optional Pi batteries are still opt-in at runtime; vendoring proves what was reviewed, it does not silently enable tools.

Current batteries include the pinned Pi CLI, MCP adapter, subagents, intercom, web/research tooling, prompt workflow helpers, and runtime dependencies needed by those packages.
