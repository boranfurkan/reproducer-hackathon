# ReProducer

**Bugs you cannot reproduce, reproduced.**

A client writes: "the page is blank on my phone", "the date is wrong", "category pages are empty". It works on your machine, so you spend longer making the bug happen than fixing it. ReProducer takes the GitHub issue plus whatever you know about the reporter ("Samsung Z Flip, Chrome, Turkish", or their screen recording), **rebuilds that person's environment**, investigates by experiment until it finds the one thing that only they have, writes a **failing test**, fixes the code until the test passes, and **asks you before opening a pull request**.

Built solo for Encode London Hackathon 2026. Entered in: Google DeepMind (Gemini 4 Argon), Agents That Ship, MongoDB Atlas.

## What it does

1. Log in with GitHub, pick a repository, pick one of its open issues.
2. Add what the issue lacks: the reporter's device, browser, language and location in your own words, an optional screen recording or screenshot, optional environment variables.
3. Click **Investigate** and watch the timeline.
4. Review the root cause, the diff, the test and what could not be reproduced. Approve, and a pull request is opened. Nothing is pushed to GitHub before that click.

### How it investigates

- **Rebuilds the reporter's environment.** Free text and video become a concrete profile: browser engine, viewport, pixel ratio, touch, locale, timezone, storage. A device catalog in MongoDB (matched with fuzzy Atlas Search) supplies realistic numbers for "Samsung Flip Z" or "MacBook M4 Pro".
- **Tests the obvious and the not-so-obvious.** The same replay runs in parallel under the reporter's profile, a neutral baseline, the reporter with one variable reset at a time (is the cause something they have?), and the reporter with extra conditions the report never mentioned, proposed by the model (blocked storage, a US timezone, dark mode: is the cause something they did not say?). The pass/fail table isolates the cause.
- **Proves the fix.** A Playwright test must fail on the reporter's profile before the change and pass after it, existing tests must stay green, and the whole matrix must pass. If not, the output goes back to the model for another attempt.
- **Remembers.** Every verified fix is stored. Before proposing a fix, it looks for similar past bugs (hybrid vector and text search) and uses them as hints.
- **Says what it could not reproduce** (real GPU, a vendor's browser build, real network) instead of pretending.

## Demo bugs

The target app is [reproducer-hackathon-demo](https://github.com/boranfurkan/reproducer-hackathon-demo), a small bookshop with three bugs that a developer in Europe would never see:

| Issue | Who is affected | What isolates it |
|---|---|---|
| Category pages empty | Turkish-language users: `toLocaleUpperCase` turns `i` into a dotted capital I | the locale |
| Blank white page | visitors whose browser blocks storage (some in-app browsers, privacy modes): a module reads `localStorage` on load | an added condition the report never mentions |
| Pickup shown one day early | visitors west of UTC: a plain date is parsed as UTC midnight | the timezone |

The agent found and fixed all three end to end (see [docs/DEMO-BUGS.md](docs/DEMO-BUGS.md)).

## How it uses the platforms

**Google DeepMind**
- `gemini-4-argon` (Interactions API, JSON-schema output, thinking level high for the root cause and fix) reads the report and any recording, plans the replay, proposes the stressors, finds the root cause, writes the test and the fix.
- An **Antigravity managed agent** is the sandbox: a Linux environment where the repository is cloned and Playwright (Chromium and WebKit) runs the matrix and the tests. The verification (red test, fix, green tests, full matrix, diff) is one sandbox call; the pass/fail signal comes from real test runs, not from the model's opinion.
- `gemini-3.8-flash` writes the pull request summary. The Gemini Files API carries screen recordings.

**MongoDB Atlas**
- **Automated Embedding** (Voyage `voyage-4` on the symptom text, `voyage-code-4` on diffs): no embedding code anywhere.
- **Vector Search** and **Atlas Search** (lexical, with facets) on `bug_memory`; **Hybrid Search** with `$rankFusion` for "have we seen this before?"; fuzzy Atlas Search for the device catalog.
- **Stream Processing** (change stream on new tickets, hopping window, `$merge` into alerts) flags several reports from the same environment as one probable bug ([setup](docs/STREAM-PROCESSING.md)).
- Runs, events, approvals and memory are stored in Atlas; secrets are redacted before anything is written.

**Agents That Ship**
- Does the whole job: reads the issue, reproduces, tests, fixes, verifies, opens a pull request.
- Knows when to stop and ask: it ends with a report instead of a guess when it cannot reproduce, cannot write a valid failing test, or runs out of attempts.
- Control and safety: the pull request needs an explicit approval click; every step is recorded in `run_events`; per-run token and attempt caps; user environment variables go only to the sandbox and are never stored; a run with environment variables never reuses a sandbox; rate limits per user.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind) deployed as a container, Playwright, MongoDB Atlas (M10), Gemini API, Octokit.

## Run it

```bash
npm ci && npx next typegen
cp .env.example .env.local     # GEMINI_API_KEY, MONGODB_URI, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_SECRET
npm run db:setup               # collections, indexes, device catalog (waits for the search indexes)
npm run dev                    # http://localhost:3000
```

The GitHub OAuth app needs the callback `http://localhost:3000/api/auth/callback/github`. From the terminal, without the web app:

```bash
npm run investigate -- 1 --notes "Samsung Galaxy Z Flip, Chrome on Android, phone language is Turkish"
```

Checks: `npm run typecheck`, `npx eslint src scripts`, `npm test`. Deployment: [docs/DEPLOY.md](docs/DEPLOY.md).

Requirements and limits: the sandbox clones the repository over plain HTTPS, so repositories must be public for now, and the project is aimed at Node and JavaScript web apps that start with npm.

## Docs

- [Status and handoff](docs/STATUS.md): current state, measured facts, next steps
- [Architecture](docs/ARCHITECTURE.md) and [agent loop](docs/AGENT-LOOP.md)
- [MongoDB design](docs/MONGODB.md) and [Stream Processing setup](docs/STREAM-PROCESSING.md)
- [UI contract](docs/UI.md) (for redesigning the interface) and [decisions and open questions](docs/DECISIONS.md)
- [Submission drafts](docs/SUBMISSION.md), [checkpoints](docs/CHECKPOINTS.md), [demo script](docs/DEMO.md), [demo bugs](docs/DEMO-BUGS.md), [deploying](docs/DEPLOY.md)
