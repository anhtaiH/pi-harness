# How to Add a Project Adapter

A project adapter tells the harness how to work in a specific repo without changing core policy.

## 1. Copy the template

```bash
cp adapters/example-project.harness.json adapters/my-project.harness.json
```

## 2. Fill in the basics

Set:

- `name`
- `projectRoot`
- important docs
- local checks
- stop conditions

Keep it boring. The adapter should be easy to review.

## 3. Add checks people trust

Good first checks:

```json
{
  "checks": [
    "npm run typecheck",
    "npm test"
  ]
}
```

Do not hide complex behavior behind vague scripts. If a check writes externally, it does not belong here.

## 4. Add connector metadata only after you need it

If the repo uses GitHub, Jira, Slack, MCP, or internal tools, describe the tools and whether they are read-only or write-like.

Metadata does not grant permission. It helps policy decide what needs external-write intent.

## 5. Run checks

```bash
npm run harness:bootstrap
npm run harness:ready -- --run-gates
```

## 6. Try one real task

Ask the agent to use the adapter while doing a small task.

Watch for friction:

- missing docs
- wrong checks
- unclear stop conditions
- connector tools that need better names
- places where the agent asks for context that should be in the adapter

Update the adapter after the first real run. That is where most of the value appears.
