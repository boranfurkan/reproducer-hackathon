# Status and handoff

Read this first when picking the project up. It records where things stand, how to run them, what was learned, and what is left. Last updated Sunday 25 October 2026, morning (London). Submission closes Sunday 25 October, 12:00 London time.

## Where it stands

Built, tested and ready to record. All five demo bugs were investigated in deep mode through the web app, reproduced, explained and fixed, and each run waits at the approval card. What is left is the owner's: record the video (`docs/DEMO.md`), submit (`docs/SUBMISSION.md`), and the clean-up after the presentation (below).

| Piece | State |
|---|---|
| App repo `boranfurkan/reproducer-hackathon` | Next.js 16.4.3. GitHub login, repository and issue pickers with triage badges, ticket form (notes, recording or screenshot, env vars, Deep or Quick), live run page (change stream, Argon's thinking, deep investigation steps, Stop), approval card, pull request creation, tracking and revisions, reply drafts for bugs that could not be reproduced, dashboard (recent runs, shared-bug alerts, what it has learned, Ask the memory), Insights. Typechecks, lints clean, 25 unit tests pass (`npm test`), builds. |
| Demo repo `boranfurkan/reproducer-hackathon-demo` | "Pagefold Books": five apps in five stacks (React 18.2, Vue 3.4, plain JS, Preact 10, Alpine.js 3.13) with vendored pinned framework files and no build step, and five bugs that code review does not find (issues #8 to #12, `docs/DEMO-BUGS.md`). The first bug set (issues #1 to #4) and its pull requests (#5 to #7) are closed. |
| Investigation | Quick mode (matrix, proposal, verification) and deep mode (D-42: an Argon tool loop over the app, its git history and the framework source, with experiments in the sandbox). Environment conditions beyond Playwright's options: page translation, content blocker, older browser without listed APIs, blocked storage, slow network (D-41). See `docs/AGENT-LOOP.md`. |
| Memory and search (MongoDB) | M10 cluster. `bug_memory` with Automated Embedding (voyage-4, voyage-code-4) and a lexical index, hybrid recall, similarity thresholds measured on real data, facets, a device catalog with fuzzy search, change streams, transactions, validators, TTL, Insights aggregations. See `docs/MONGODB.md`. |
| Stream Processing | **Running** on Atlas (workspace `reproducer`, processor `ticketClusters`, SP10) since the night of 24 to 25 October. Billed while it runs: stop it after the presentation (`docs/STREAM-PROCESSING.md`). |
| Video and screenshots | Argon reads a recording through the Files API, with timestamped key moments (tested standalone and at the API level; the upload form has not been clicked through in a browser). |
| Deployment | `output: "standalone"`, Dockerfile, `docs/DEPLOY.md`. The standalone server was started and tested by hand; `docker build` and a real host were not tried. The demo is recorded locally. |
| GitHub OAuth app | Credentials in `.env.local`, callback `http://localhost:3000/api/auth/callback/github`. |

## Deep runs on 25 October

The kept run of each demo issue (latest verified fix, deep mode, through the web app; older and failed runs are in the `*_archive` collections). Every run: test red before the fix, green after, required matrix rows passing in Chromium and WebKit. Sandbox repairs: calls that found their environment reset and set it up again.

| Issue | Result | Time | New tokens | Largest context | Deep rounds | Experiments | Fix attempts | Sandbox repairs |
|---|---|---|---|---|---|---|---|---|
| #8 | fixed, verified | 26 min | 2213k | 326k | 4 | 2 | 2 | 4 |
| #9 | fixed, verified | 13 min | 824k | 172k | 2 | 1 | 1 | 2 |
| #10 | fixed, verified | 14 min | 235k | 19k | 3 | 1 | 1 | 3 |
| #11 | fixed, verified | 14 min | 294k | 27k | 4 | 1 | 1 | 3 |
| #12 | fixed, verified | 16 min | 406k | 53k | 3 | 1 | 1 | 3 |

Usage over the night (from MongoDB, runs created after midnight London time): 23 investigations and about 11M new tokens in total, including the runs that failed or were stopped while the deep mode was being built. None looped; every run stayed inside its caps.

## Verified

- **25 Oct, overnight**: the five deep runs above, end to end through the web app; Stream Processing alerts from real tickets; Ask the memory and the learned panel on real memory; history of both repositories scanned for Gemini keys, GitHub tokens, connection strings with credentials and attribution lines (clean: the only matches are placeholders and test fixtures).
- **24 Oct**: GitHub login in the browser and a real pull request opened from the Approve button (PR #5 on the demo repo, since closed); a clean clone passes install, typecheck, lint, tests and build without `.env.local`; the whole web path with real GitHub data; memory recall across runs; ownership checks, approval gating, tampered cookies, upload types, rate limits and stale runs on the routes; pull request creation against a mock GitHub API (`src/lib/github.test.ts`); a revision of a pull request from a reviewer comment (D-33); UI screenshots at desktop and phone width.

Not verified: the upload form in a browser with a long recording; `docker build` and a real host; private repositories.

## How to run things

```bash
npm ci && npx next typegen        # after a fresh clone (typegen creates the LayoutProps types that tsc needs)
npm run dev                       # the web app on http://localhost:3000 (log in with GitHub)
npm run typecheck                 # tsc --noEmit
npx eslint src scripts            # lint
npm test                          # unit tests (node:test via tsx)
npm run build                     # production build (can run while the dev server is up: dev output is in .next/dev)
npm run ui:shots                  # screenshots of every page and loading state (desktop and phone) with seeded data, into .ui-shots/
npm run db:setup                  # collections, indexes, validators, TTL, device catalog (safe to repeat)
npm run demo:cluster              # three demo tickets from one environment: a shared-bug alert in seconds (-- --clean removes it)
npm run investigate -- 8 --deep --notes "Customer in Munich, Chrome on Windows 11, German is her language."   # one run from the terminal
npm run investigate -- 8 --env <sandbox environment id> --notes "..."   # reuse a warm sandbox (skips the install)
npm run investigate -- 8 --no-db  # do not write to MongoDB
npm run investigate -- 8 --video recording.webm --notes "..."   # attach a screen recording or screenshot
GITHUB_TOKEN=... npm run demo:record -- 8 --notes "..."   # record the web app through an investigation with Playwright (stops at the approval card)
```

The terminal runner runs quick mode unless `--deep` is given, prints a timeline, the diff, token use and per-call sandbox timings, and saves the result to `.runs/<timestamp>.json` (gitignored). `GITHUB_TOKEN` (reads only) raises the GitHub API limit from 60 to 5,000 requests per hour.

`.env.local` (gitignored) must contain `GEMINI_API_KEY`, `MONGODB_URI`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET`. Names and the optional ones are listed in `.env.example`. The Stream Processing scripts read `STREAM_PROCESSING_URI` from the shell, never from a file.

## Source layout

```
src/lib/
  config.ts            model names, caps (LIMITS), sandbox network
  types.ts             EnvProfile, Sandbox interface, RunEvent types, CallTiming
  gemini.ts            client, TokenBudget (new, cached and peak context tokens), withRetry (429/503 backoff), SpendingCapError
  redact.ts            secret redaction for anything stored or shown
  mongo.ts             single shared client (globalThis), db(), collection(), COLLECTIONS
  schema.ts            $jsonSchema validators and TTL definitions
  events.ts            RunDoc/RunEventDoc/ApprovalDoc/TicketDoc, startRun(): emit/finish/fail, the tickets the stream processor reads
  auth.ts, api.ts      AES-256-GCM encrypted session cookie; requireSession(), githubError() for route handlers
  github.ts            Octokit helpers: repos, issues, openFixPullRequest, pull request feedback, push to a branch, comments
  runner.ts            startInvestigation(): create the run, investigate in the background
  warm.ts              warm sandbox registry and keep-alive (on by default)
  memory.ts            bug_memory: record, hybrid recall, similar fixes, similarity by symptom, facets, search index definitions
  devices.ts           device catalog and fuzzy matching (Atlas Search)
  media.ts             upload to the Gemini Files API, trusted media references
  prtrack.ts           pull request tracking in transactions, memory outcome
  revise.ts            pull request revisions from review comments
  insights.ts          the Insights aggregations
  hooks.ts, client.ts  ALL data fetching and actions for the UI, and the shared HTTP types (docs/UI.md)
  agent/
    argon.ts           askJson(): Argon with JSON-schema output, streaming thoughts, conversation state
    schemas.ts         schemas and types (Understanding, Stressor, ReplayPlan, Proposal, Revision)
    profiles.ts        baseline, one-variable resets, stressors, overrides, failure signatures
    repo.ts            repository tree, on-demand reads, digest, git log and commits from GitHub
    investigate.ts     the loop
    deep.ts            the deep investigation's tool loop (D-42)
    verify.ts          red test, fix, green tests, matrix, diff (shared by the loop and revisions)
    explain.ts         "Why this happens": Google Search, code execution and URL context together
    ask.ts             Ask the memory (function calling over MongoDB)
    triage.ts          issue list badges
    reply.ts           reply drafts to reporters
    pr.ts              pull request title and description
  harness/
    scripts.ts         scripts that run inside the sandbox (boot, matrix, test, wait for WebKit's libraries)
    conditions.ts      page translation, content blocker, removed APIs, slow network (matrix and generated tests)
  sandbox/antigravity.ts   AntigravitySandbox (run, runWith, checksummed file writes, in-call repair)
src/app/               pages and route handlers (route table in ARCHITECTURE.md)
src/components/        presentation only (docs/UI.md)
scripts/               investigate.ts, setup-db.ts, ui-shots.ts, record-demo.ts, demo-cluster.ts, stream/ (processor pipeline and setup)
skills/                third-party skills (reference material, not our code)
docs/                  documentation
```

## Measured facts about the platform (do not re-learn these)

Gemini
- **Argon** works on the hackathon key. The account is a temporary Tier 3 project, deleted about a day after the hackathon.
- **Built-in tools and functions together**: on Argon, Google Search and URL context can be combined with function declarations in one call, and a function-calling chain can continue as a schema-constrained JSON turn without tools (tested 25 Oct; the fix proposal relies on it).
- **Implicit caching** (explicit caching is not supported) hits on only about half of the chained turns of a long conversation: a turn over a 300k context often costs the whole context again. The deep budget therefore counts new tokens and stops exploring early enough to leave room for the fix.
- **Thought summaries** appear only for long high-effort steps; short steps finish without any.

Sandbox (Antigravity managed agent)
- **Per-call cost grows with bytes under `/workspace`** (about 40 ms per MB). Files under `/opt` are free, so everything heavy is in `/opt`.
- **`/opt` is wiped after 15 idle minutes** (the environment is restored from a snapshot; only `/workspace` survives). The keep-alive pings every 9 minutes, at most 8 times.
- **Under load the environment is reset between calls**: with three runs at once the environment id stays the same but `/opt` is empty, sometimes twice in one run. A call that finds the harness or the clone missing repeats itself once with the harness files and the boot in front of it, in the same call (D-42).
- **The agent retypes the command**, so files go in as quoted heredocs with a `sha256sum` check (`PAYLOAD_BAD`, retried up to 3 times). It sometimes runs a failed command again on its own: outputs are joined, so the last `[EXIT:n]` counts, and a matrix call whose result was cut off is retried once.
- **Latency**: even a no-op call took 20 to 50 s on 25 Oct. A cold start is about 71 s (D-40).
- **WebKit in the sandbox renders slowly** (about 4 frames per second measured), so a CSS transition can outlast a click timeout. The matrix uses 6 s per step and four pages at a time per engine; the demo drawer fades instead of sliding.
- **Inline `sources` are accepted only when an environment is created**, not with `environment_id` (400). The Files API is read-only.
- **Presets**: `NODE_OPTIONS=--require global-agent/bootstrap` and a `NODE_PATH` for it. Append to `NODE_PATH`, never replace it.
- **Big output is truncated** (`<truncated N lines>`), so scripts print compact JSON between markers (`@@RESULT@@ ... @@END@@`).
- **Staging directories persist in a warm sandbox** (D-23): unique paths, wiped at boot.
- **Env vars are fixed when an environment is created** (D-19): runs with env vars get a fresh environment that is never reused.
- **Playwright**: Chromium and WebKit work; Firefox crashes unless `MOZ_DISABLE_CONTENT_SANDBOX=1` and is not installed. `browserName` cannot be set inside a `describe`. With `locale: "tr-TR"` Chromium does not change the default locale of a no-argument `toLocaleUpperCase()`; WebKit and Firefox do.

MongoDB
- **Fused ranks only order results**: `$rankFusion` gave 0.016 to every hit, so thresholds use the cosine score from `$vectorSearch`. Measured on real memory: related bugs 0.78 to 0.85 and unrelated ones 0.62 to 0.72 for issue text (threshold 0.76); the loop's recall query shares the memory text's template, which lifts every score (same bug 0.89 to 0.92, unrelated up to 0.80; threshold 0.82); diffs 0.85.
- **Automated Embedding is text only**: screenshots and video are described by Argon first.
- **Stream Processing**: no free tier; windows stall on a quiet change-stream source (the watermark does not move and there is no idle timeout), so the processor keeps counters instead (`docs/STREAM-PROCESSING.md`).
- Server 8.0.34: `$rankFusion` works, `$scoreFusion` (8.3+) does not.

Other
- **GitHub without a token allows 60 requests per hour per IP**; file contents are then read from `raw.githubusercontent.com`, and rate-limit errors fail fast.
- **Next.js 16**: read `node_modules/next/dist/docs/` before writing Next code. Route handlers run at request time when they touch the database.
- **Tooling**: scripts run with `tsx` as CommonJS, so wrap code in an async `main()`. `octokit` is ESM-only (`await import("octokit")`). Do not name scripts `.mts`.

## Left for the owner

1. Record the demo (`docs/DEMO.md`) and add the video link to `docs/SUBMISSION.md`; submit by 11:00.
2. After the presentation: stop the stream processor (`sp.ticketClusters.stop()` in the workspace shell, or `npx tsx scripts/stream/setup.ts --stop`), and change the password of the Atlas database user `furkanboran` (it was pasted in a chat).
3. Export anything worth keeping before the account is deleted.

## What happened overnight (24 to 25 October): for review

Actions that wrote to external systems, on the owner's instruction to decide alone while they slept:
- Demo repo `main`: rebuilt as Pagefold Books (five apps, vendored framework files, tests), pushed; issues #8 to #12 created; #1 to #4 closed.
- App repo `main`: commits for the deep mode, the environment conditions, the sandbox repairs and the docs, all authored as the owner with no attribution lines.
- Atlas: the stream processor created and started in the workspace the owner set up; the connection string was used from an environment variable only and is not in any file.
- The owner's `gh` token was used for **read-only** GitHub calls in test runs. Nothing was approved and no pull request was opened.
- MongoDB: runs from the night other than the five kept ones were moved to `runs_archive`, `run_events_archive` and the other `*_archive` collections, not deleted.

Things found and fixed on the way (good stories for the pitch): the sandbox resetting environments under load (in-call repair), WebKit too slow for a sliding drawer, a content blocker emulation that raised its own page error, a probe experiment's steps adopted as the replay, the same bug split in two by engine-specific error wording, unrelated memory hits (measured thresholds), and the token budget counting cached context.

## Next steps after the hackathon

1. Deploy (`docs/DEPLOY.md`) and add the production OAuth callback.
2. Private repositories: the sandbox clones over plain HTTPS; the egress allowlist can inject credentials (Q-03, not tried).
3. Partial matrix progress while a matrix runs; the comic panels of the design.

## Incident log

- **24 Oct, daytime**: every Gemini call returned `429 RESOURCE_EXHAUSTED: billing account has exceeded its monthly spending cap` (the shared hackathon billing account, not our usage). The organisers issued a new key. `withRetry` throws `SpendingCapError` immediately for this case. Sandbox environment ids from the old key do not work with the new one.
- **25 Oct, night**: with three deep runs at once, sandbox environments were reset between calls; fixed by the in-call repair (D-42).

## Event logistics

- The demo may be a sped-up recording; top-10 teams pitch live around 3 pm Sunday (reported by another participant; confirm with the organisers).
- A new Gemini account and key were issued after the spending-cap incident; the DeepMind contact replies to the original email.

## Open questions

See `docs/DECISIONS.md` (Q-03, Q-04): repository access for the sandbox without exposing the token, and a custom agent with a base environment.

## Working agreements with the owner

- Commits are authored by the owner (git identity is already configured). **No AI or tool attribution anywhere**: no co-author lines, no "generated with" text, nothing in commit messages, PR text, code or docs.
- Commit and push only when asked. Anything that writes to GitHub or another external system needs the owner's explicit OK.
- Never paste secrets into chat; the owner edits `.env.local` themselves.
- Do not claim things work without running them; report measured numbers.
- Keep docs current: decisions go in `DECISIONS.md`, measured behaviour in this file.

## Where things live outside the repo

- `~/Desktop/reproducer-hackathon-demo`: the demo shop (separate git repo).
- `~/Desktop/reproducer-build-plan.md`: the first plan, superseded by `docs/`. Kept for history.
- `~/Desktop/encode-london-hackathon-2026.md`: the challenge briefs (judging criteria, prizes, requirements).
- Hackathon constraints: the key must never reach GitHub (project keys get killed), no abuse of the API, the account is deleted the day after.
