# ReProducer

**Bugs you cannot reproduce, reproduced.**

A customer writes: "the shop goes white when I empty my basket". It works on your machine, and the code looks fine. A coding assistant reads it and finds nothing, because nothing in the code is wrong on its own: the bug only exists where the code meets something that customer has. Their browser translates the page. Their Mac is set to reduce motion. They run a content blocker. They live in a timezone whose clocks go back tonight. Their iPhone was never updated.

ReProducer takes the GitHub issue plus whatever you know about the reporter ("customer in Munich, Chrome, German"), **rebuilds that person's environment**, **investigates in depth** with Gemini 4 Argon (the application, its git history and the full source of the framework the page uses in one context, experiments in real browsers), writes a **failing test**, fixes the code until the test passes, and **asks you before opening a pull request**.

Built solo for Encode London Hackathon 2026. Entered in: Google DeepMind (Gemini 4 Argon), Agents That Ship, MongoDB Atlas.

## What it does

1. Log in with GitHub, pick a repository, pick one of its open issues (badges mark the ones that look environment-specific or like a bug already fixed).
2. Add what the issue lacks: the reporter's device, browser, language and location in your own words, an optional screen recording or screenshot, optional environment variables. Choose Deep (default) or Quick.
3. Click **Investigate** and watch it work live: Argon's thinking, every file it reads, every experiment, the conclusion.
4. Review the root cause, why the platform behaves that way (with sources), the diff, the test and what could not be reproduced. Approve, and a pull request is opened. Nothing is pushed before that click.
5. Afterwards it follows the pull request (reviews, merged, closed), revises the fix when a reviewer asks for changes (again only pushed on your click), and drafts a reply to the reporter when a bug cannot be reproduced.

### How it investigates

- **Rebuilds the environment.** Notes and video become a concrete profile: engine (Chromium or WebKit), viewport, pixel ratio, touch, locale, timezone, and the conditions only some people have: the browser translating the page, a content blocker, reduced motion, an older engine without newer APIs, blocked storage, a slow network. A device catalog in MongoDB supplies realistic numbers ("iPhone 8 she never updated" becomes WebKit without the APIs Safari added in 15.4).
- **Runs a matrix.** The same replay in both engines under the reporter's profile, a neutral baseline, one-variable resets and extra conditions the report never mentioned.
- **Investigates in depth.** One Argon conversation with up to a million tokens of context: the report, the matrix, the application, the whole git history and the full source of the vendored framework files the failing page loads (React's `react-dom` alone is about 280k tokens). Argon reads and searches any file, reads commits, searches the web, and runs experiments in the sandbox: up to six environment variants at once, with a probe expression measured in the page (a computed style, whether an API exists, the DOM state). It concludes with the environment that reproduces the bug and the evidence.
- **Proves the fix.** A Playwright test must fail on the failing environment before the change and pass after it, existing tests must stay green, and the matrix must pass. The proposal continues the investigation's own conversation, so the fix is written with everything it learned still in context.
- **Remembers**, and learns from what reviewers did with its pull requests.
- **Says what it could not reproduce** (real GPU, a vendor's browser build, real network) instead of pretending.

## Demo bugs

The target app is [reproducer-hackathon-demo](https://github.com/boranfurkan/reproducer-hackathon-demo): Pagefold Books, five small apps in five stacks with framework files vendored at pinned versions. Each bug passes code review; each was proven to fail only under its own condition. Details in [docs/DEMO-BUGS.md](docs/DEMO-BUGS.md).

| Issue | Stack | What customers see | What only they have |
|---|---|---|---|
| #8 | React 18.2 | The shop turns white after emptying the basket | Chrome translates the English page into German; React then removes a text node the translator already replaced |
| #9 | Vue 3.4 | Nothing responds after closing an order | Reduced motion: an accessibility rule removes transitions, so the drawer waits for a `transitionend` that never fires |
| #10 | plain JS | Pay now does nothing | A content blocker blocks the analytics script, and the pay handler calls it first |
| #11 | Preact | One session of the night event is missing | The UK clocks go back that night; two sessions share the label "01:00" |
| #12 | Alpine.js | The reading list is blank | An iPhone on iOS 14: a vendored helper uses APIs Safari only added in 15.4 |

The agent found and fixed all five end to end with deep investigation (see [docs/STATUS.md](docs/STATUS.md)).

## How it uses the platforms

**Google DeepMind (Gemini 4 Argon)**
- **Deep investigation**: a long Argon conversation (thinking high, thought summaries streamed to the page) over a context of up to a million tokens, with **function calling** (read and search files, git history, sandbox experiments with probes, conclude) combined with the built-in **Google Search** and **URL context**.
- **Conversation state** (`previous_interaction_id`): the fix proposal, its retries and later pull request revisions continue the investigation's conversation; implicit caching serves the large context on later turns.
- **Streaming**: Argon's thought summaries appear live on the run page.
- **Built-in tools together** for "Why this happens": Google Search grounding, code execution and URL context explain the platform rule behind the bug with sources and a computed proof.
- **Video understanding**: a customer's recording becomes steps, environment clues and timestamped key moments (Files API).
- **Antigravity managed agent** as the sandbox (Linux, Playwright with Chromium and WebKit): the pass/fail signal comes from real browsers, not the model's opinion.
- `gemini-3.8-flash` triages the issue list, writes pull request summaries, drafts replies to reporters and answers "Ask the memory" through function calling over MongoDB.

**MongoDB Atlas**
- **Automated Embedding** (Voyage `voyage-4` on symptoms, `voyage-code-4` on diffs), **Vector Search**, **Atlas Search** with facets, **Hybrid Search** (`$rankFusion`) for "have we seen this before?", fuzzy search over a device catalog.
- **Change streams** push the run page live; **transactions** keep the run, the approval, the pull request history and the memory consistent; the memory learns whether its pull requests were merged.
- **Atlas Stream Processing** (running): a processor reads new tickets from a change stream and keeps a counter per repository, engine and locale; several reports from one environment become a "possible shared bug" alert.
- **Aggregation pipelines** (`$setWindowFields`, `$lookup`, `$group`) power the Insights page; **schema validation** and **TTL indexes** keep the data clean.

**Agents That Ship**
- Does the whole job: reads the issue, reproduces, investigates, tests, fixes, verifies, opens a pull request, follows it, revises it.
- Knows when to stop and ask: it ends with a report and a drafted question to the reporter when it cannot reproduce.
- Control and safety: every write to GitHub (pull request, revision, reply) is its own approval click; every step is recorded; per-run token, round and time caps; user environment variables go only to the sandbox and are never stored; rate limits per user; a Stop button.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind), Playwright, MongoDB Atlas (M10), Gemini API (Interactions), Octokit.

## Run it

```bash
npm ci && npx next typegen
cp .env.example .env.local     # GEMINI_API_KEY, MONGODB_URI, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_SECRET
npm run db:setup               # collections, indexes, validators, device catalog (waits for the search indexes)
npm run dev                    # http://localhost:3000
```

The GitHub OAuth app needs the callback `http://localhost:3000/api/auth/callback/github`.

Checks: `npm run typecheck`, `npx eslint src scripts`, `npm test`, `npm run build`. UI screenshots: `npm run ui:shots`. Deployment: [docs/DEPLOY.md](docs/DEPLOY.md).

Requirements and limits: the sandbox clones the repository over plain HTTPS, so repositories must be public for now, and the project is aimed at JavaScript web apps that start with npm.

## Docs

- [Status and handoff](docs/STATUS.md): current state, measured facts, next steps
- [Architecture](docs/ARCHITECTURE.md) and [agent loop](docs/AGENT-LOOP.md)
- [MongoDB design](docs/MONGODB.md) and [Stream Processing](docs/STREAM-PROCESSING.md)
- [UI contract](docs/UI.md) and [decisions](docs/DECISIONS.md)
- [Submission drafts](docs/SUBMISSION.md), [demo script](docs/DEMO.md), [demo bugs](docs/DEMO-BUGS.md), [deploying](docs/DEPLOY.md)
