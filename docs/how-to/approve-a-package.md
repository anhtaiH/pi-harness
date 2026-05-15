# How to Approve a Package

Packages can change the agent's behavior. Do not treat them as ordinary convenience installs.

## 1. Review the package

```bash
npm run package:review -- npm:<package>@<version>
```

This downloads the tarball and writes a source-review report. It does not prove the package is safe. It gives you a structured look at scripts, dependencies, Pi resources, and static signals.

## 2. If the review passes

Install through the reviewed path:

```bash
npm run package:install-reviewed -- npm:<package>@<version>
```

Then verify provenance:

```bash
npm run package:provenance -- --json
```

## 3. If the review is blocked

Do not install it by force.

If the package is necessary, use manual approval:

```bash
npm run package:approval -- template --spec npm:<package>@<version> --json
```

Fill in the approval with:

- exact package spec
- reviewer
- approval and expiry timestamps
- accepted risks
- mitigations
- verification commands
- rollback plan

Then run:

```bash
npm run package:approval -- doctor --json
npm run package:provenance -- --json
```

## 4. Keep the record visible

A blocked review should still show as blocked in provenance. The difference is that it also has a valid manual approval.

That is intentional. The repo should not pretend the risk disappeared.

## 5. Update vendored artifacts when needed

If the package is part of clone-and-run portability, add or update:

- `vendor/npm/<package>.tgz`
- `vendor/manifest.json`
- `package-reviews/<package>/review.json`
- `package-provenance.lock.json`

Then run gates.
