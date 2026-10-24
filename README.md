# ReProducer

Bug tickets are hard to act on when the bug only happens on someone else's device. ReProducer is an agent that takes a bug report (text, screenshot or screen recording), rebuilds the reporter's environment (browser engine, viewport, locale, timezone, storage), investigates by experiment until it finds why only that user sees the bug, writes a failing test, fixes the code until the test passes, and asks the developer before opening a pull request.

Built for Encode London Hackathon 2026. Entered in: Google DeepMind (Gemini 4 Argon), Agents That Ship, MongoDB Atlas.

## How it works

1. Log in with GitHub, pick a repo, pick one of its open issues.
2. Add what the issue lacks: environment notes ("Samsung Z Flip, folded, Chrome, Turkish"), an optional screen recording, optional env vars.
3. Click **Investigate**. Watch the live timeline.
4. Review the root cause, the failing test, the diff and the fidelity report (what was and was not emulated).
5. Approve, and a pull request is opened. Nothing external happens before that click.

## Stack

| Part | Tech |
|---|---|
| App | Next.js (App Router, TypeScript, Tailwind), deployed as a container |
| Reasoning | `gemini-4-argon` via the Interactions API |
| Sandbox | Antigravity managed agent (Linux) running Playwright (Chromium, WebKit) |
| Summaries | `gemini-3.8-flash` |
| Data | MongoDB Atlas: Vector Search, Atlas Search, hybrid search, Automated Embedding, Stream Processing |

## Docs

- [Status and handoff](docs/STATUS.md): start here
- [Architecture](docs/ARCHITECTURE.md)
- [Agent loop](docs/AGENT-LOOP.md)
- [MongoDB design](docs/MONGODB.md)
- [Decisions and open questions](docs/DECISIONS.md)
- [Checkpoints](docs/CHECKPOINTS.md)
- [Demo script](docs/DEMO.md)

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Required environment variables are listed in `.env.example`. Never commit real values.

## Companion repo

The demo target app that ReProducer investigates lives in [reproducer-hackathon-demo](https://github.com/boranfurkan/reproducer-hackathon-demo).
