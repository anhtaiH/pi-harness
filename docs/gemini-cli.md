# Gemini CLI Notes

Research and setup date: 2026-05-12.

## Local Status

Installed globally:

```bash
gemini --version
# 0.41.2
```

Authenticated with Google OAuth through the interactive Gemini CLI flow. Verification passed with:

```bash
gemini --skip-trust --prompt "Respond with exactly: gemini-auth-ok" --output-format text --approval-mode plan --sandbox=false
```

This lab also has a small wrapper:

```bash
./bin/gemini-lab
./bin/gemini-lab --prompt "Respond with exactly: gemini-auth-ok" --output-format text --approval-mode plan --sandbox=false
npm run gemini:smoke
```

The wrapper only changes the working directory and passes `--skip-trust`. It does not isolate or inspect Gemini credentials.

## Auth Options

Official Gemini CLI docs list three interactive auth paths:

- Login with Google.
- Gemini API key.
- Vertex AI.

For this machine, Google OAuth is the right default because it uses the account/session path rather than a raw API key. If you later want headless API-key mode, export:

```bash
export GEMINI_API_KEY="..."
```

For Vertex AI, expect at least:

```bash
export GOOGLE_CLOUD_PROJECT="..."
export GOOGLE_CLOUD_LOCATION="..."
```

Treat all Gemini keys and Google Cloud credentials as secrets. Do not put them in this repo, shell history snippets, docs, or task evidence.

## Common Use

Interactive:

```bash
./bin/gemini-lab
```

One-shot, text output:

```bash
./bin/gemini-lab --prompt "Review docs/pi-extras.md for gaps." --output-format text --approval-mode plan --sandbox=false
```

Plan/read-only stance:

```bash
./bin/gemini-lab --approval-mode plan --sandbox=false
```

Useful slash commands inside Gemini:

- `/auth`: inspect or change auth method.
- `/help`: command reference.
- `/quit`: exit interactive mode.
- `/upgrade`: account/plan upgrade flow when available.

## Harness Fit

Gemini CLI is a useful comparative lane for the Pi harness, not the Pi substrate itself:

- Use it to sanity-check plans, docs, and implementations from another model family.
- Keep it outside the Pi auth boundary. Pi credentials are isolated in `.pi-agent/`; Gemini uses its normal user config.
- Use one-shot plan mode for review tasks when you want low blast radius.
- Do not rely on Gemini for harness enforcement; enforcement belongs in Pi extensions or external wrappers.

