# Status and handoff

Read this first when picking the project up. It records where things stand, how to run them, what was learned, and what to do next. Last updated Saturday 24 October 2026, evening (London). Submission closes Sunday 25 October, 12:00 London time.

## What exists

| Piece | State |
|---|---|
| App repo `boranfurkan/reproducer-hackathon` | Next.js 16.4.3. The investigation loop, and the product shell: GitHub login, repo and issue pickers, ticket form with notes, env vars and a recording or screenshot, live run page with timeline, approval card with similar past fixes, approve and reject routes, pull request creation, dashboard with memory facets and shared-bug alerts. Builds, typechecks, lints clean; 13 unit tests pass (`npm test`). The ticket form starts warming the sandbox in the background (`POST /api/warm`); `npm run demo:record` records the web app through an investigation. |
| Demo repo `boranfurkan/reproducer-hackathon-demo` | "Pagefold Books" with four bugs pushed: issues #1 to #4, tags `v0-buggy` (bug 1 only), `v1-all-bugs` (three) and `v2-four-bugs` (all four). Bug 4 (search lower-cases with the Turkish locale) is a cousin of bug 1 so the memory has something to recall. |
| Investigation loop | Fixed all four demo bugs end to end in clean sandbox runs on 24 Oct (#1 locale with a screen recording, #4 search with a memory recall of #1, #2 only the "storage blocked" stressor reproduces it, #3 timezone). About 4 to 5 minutes warm, 77k to 95k tokens, one fix attempt each; see DEMO-BUGS.md. The sandbox agent runs on Argon (D-26). |
| Memory and search (MongoDB) | M10 cluster, six working indexes and collections. `bug_memory` with Automated Embedding (voyage-4 and voyage-code-4) and a lexical Atlas Search index, hybrid recall with `$rankFusion`, facets, a 10-device catalog with fuzzy Atlas Search. All verified with synthetic data; wired into the loop. |
| Video and screenshots | Argon reads a recording through the Files API (tested standalone: 2 s upload, 8 s analysis). Upload route, form field and prompt are built and tested at the API level. |
| Deployment | `output: "standalone"`, Dockerfile, `.dockerignore`, `docs/DEPLOY.md`. The standalone layout was started and tested by hand. `docker build` and a real host were not tried. |
| Stream Processing | App side done (`tickets` written, `/api/clusters`, dashboard card). The processor itself needs someone with Atlas access: see `docs/STREAM-PROCESSING.md`. |
| GitHub OAuth app | Created, credentials in `.env.local`. Callback `http://localhost:3000/api/auth/callback/github`; add the production callback when the host exists. |

Nothing has been deployed. The pull request code has only run against a mock GitHub.

### Verified vs not verified (24 Oct evening)

Verified by the owner on 24 Oct evening: GitHub login in the browser, an investigation of issue #4 started from the UI, and **a real pull request opened on GitHub from the Approve button** (PR #5 on the demo repo: one commit by the owner, two files, full description; wording then improved, see D-28). Verified: memory recall with real entries across runs (issues 2, 3 and 4 each recalled earlier fixes); **the whole web path with real GitHub data** (a forged session carrying the owner's read-only token, no login screen, never approve): `/api/session`, `/api/repos` (the owner's real repositories), the issues route, `/api/warm`, `POST /api/runs`, polling `/api/runs/[id]`, the finished run page and the dashboard, issue #2 fixed in 6 min 23 s including about 2 minutes of waiting for the cold warm-up, 79k tokens, three similar past fixes shown on the approval card; `npm run dev` loads all pages without console errors; production build and the standalone layout; every route unauthenticated; the login redirect and state check; authenticated routes with a forged test session against MongoDB (ownership, event order, approval gating, token never exposed, tampered cookie, upload types, rate limit, stale runs); stressor validation; the harness locally; full sandbox runs on all three bugs; env vars in the sandbox; memory, device matching, facets and diff similarity with synthetic data; the PR description text (`buildPrBody`); UI screenshots at desktop and phone width.

`openFixPullRequest` is verified against a local mock of the GitHub API (`src/lib/github.test.ts`): request order, content, base branch, one commit with `Fixes #N`, no merge, no delete.

Not verified: the GitHub login screen itself (needs the owner);  the web upload form in a browser; the stream processor; `docker build`; the keep-alive timer; a long recording.

## How to run things

```bash
npm run dev                       # the web app on http://localhost:3000 (log in with GitHub)
npm ci && npx next typegen        # after a fresh clone or if node_modules/.next were deleted (typegen creates the LayoutProps types that tsc needs)
npm run typecheck                 # tsc --noEmit
npm test                          # unit tests (node:test via tsx)
GITHUB_TOKEN=... npm run demo:record -- 2 --notes "..."   # record the real web app through an investigation (see DEMO.md)
npx eslint src scripts            # lint
npm run db:setup                  # create collections and indexes (safe to repeat)
npm run investigate -- 1 --notes "Samsung Galaxy Z Flip, Chrome on Android, phone language is Turkish, customer is in Istanbul"
npm run investigate -- 1 --env <sandbox environment id> --notes "..."   # reuse a warm sandbox (skips the install)
npm run investigate -- 1 --no-db  # do not write to MongoDB
npm run investigate -- 1 --video recording.webm --notes "..."   # attach a screen recording or screenshot
GITHUB_TOKEN=... npm run investigate -- 1   # optional: raises the GitHub API limit from 60 to 5,000 requests per hour (reads only)
```

The runner prints a timeline, the diff, token use and per-call sandbox timings, and saves the full result to `.runs/<timestamp>.json` (gitignored). The last sandbox environment id is printed at the end. Reuse it while it is warm.

`.env.local` (gitignored) must contain `GEMINI_API_KEY`, `MONGODB_URI`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET`. Names are listed in `.env.example`.

## Source layout

```
src/lib/
  config.ts            model names, caps (LIMITS), sandbox network
  types.ts             EnvProfile, Sandbox interface, RunEvent types, CallTiming
  gemini.ts            client, TokenBudget, withRetry (429/503 backoff), SpendingCapError
  redact.ts            secret redaction for anything stored or shown
  mongo.ts             single shared client (globalThis), db(), collection(), COLLECTIONS
  events.ts            RunDoc/RunEventDoc/ApprovalDoc, startRun(): emit/finish/fail
  auth.ts              AES-256-GCM encrypted session cookie, getSession/setSession
  api.ts               requireSession(), githubError() for route handlers
  github.ts            Octokit helpers: repos, issues, openFixPullRequest (branch + one commit + PR)
  runner.ts            startInvestigation(): create run, investigate in the background
  warm.ts              warm sandbox registry and optional keep-alive (KEEP_SANDBOX_WARM=true)
  memory.ts            bug_memory: record, hybrid recall, similar fixes, facets, search index definitions
  devices.ts           device catalog and fuzzy matching (Atlas Search)
  media.ts             upload to the Gemini Files API, trusted media references
  client.ts            browser-side fetch helper and shared types
  agent/
    argon.ts           askJson(): Argon with JSON-schema output
    schemas.ts         schemas and types (Understanding, Stressor, ReplayPlan, Proposal)
    profiles.ts        BASELINE, one-variable ablations, validated stressor profiles
    repo.ts            read the repo's text files from GitHub (octokit via dynamic import)
    investigate.ts     the loop
    pr.ts              pull request description (flash summary with a template fallback)
  harness/scripts.ts   scripts that run inside the sandbox (boot, matrix, test)
  sandbox/antigravity.ts   AntigravitySandbox (run, runWith, checksummed file writes)
src/app/               pages and route handlers (see ARCHITECTURE.md for the route table)
src/components/        Home, IssueList, TicketForm, RunPage, Shell, Header, ui atoms
scripts/               investigate.ts (terminal runner), setup-db.ts
skills/                third-party skills (reference material, not our code)
docs/                  documentation
```

## The loop as built (`src/lib/agent/investigate.ts`)

1. In parallel: the developer's notes are matched to the device catalog (Atlas Search) and Argon interprets the issue, the notes, the matched devices and any attached recording into an environment profile plus up to 3 stressors; the repo's text files are read from GitHub; the sandbox boots (`boot.sh`: wipes `/opt/stage`, installs Playwright into `/opt` if missing, clones or resets the repo, runs `npm ci` only when the lockfile changed). The replay plan is written as soon as the interpretation and the code are ready, so it overlaps with the boot.
2. Matrix (one sandbox call, up to 9 profiles, one browser per engine): the reporter profile, a neutral baseline, the reporter with one variable reset (engine, locale, timezone, device, storage, colour scheme), and the reporter with up to 3 extra conditions added (stressors proposed by Argon, e.g. storage blocked, another timezone). If the reporter fails, the variable whose reset flips the result is the cause. If only a stressor profile fails, that added condition is the cause and the test runs under that profile.
3. Memory: hybrid recall of similar past bugs (`recallSimilar`); the hits go into the prompt as hints and onto the timeline. Then one Argon call (thinking level high) returns root cause, a Playwright test, and a candidate fix.
4. One sandbox call verifies: reset the clone, add the test (must be red: 1 failed, 1 passed), apply the fix, run all tests, re-run the matrix, print the diff.
5. If a check fails, the output goes back to Argon and it tries again, up to `LIMITS.maxFixAttempts` (3).
6. Stops at `approval_requested`. On the run's finish a verified fix is stored in `bug_memory`. The web app's approve route then opens the pull request (never before the click).

Models: `gemini-4-argon` for all reasoning (Interactions API, `generation_config.thinking_level`, `response_format` JSON schema). The sandbox is `antigravity-preview-09-2026` used as a remote shell on its default model (gemini-3.8-flash); Argon can be selected with `agent_config.model`.

## Measured facts about the platform (do not re-learn these)

- **Argon**: works on the hackathon key. Account is a temporary Tier 3 project (very high quota); deleted about a day after the hackathon.
- **Sandbox per-call cost grows with bytes under `/workspace`** (about 40 ms per MB; 1.1 GB of browsers made every call 57 s). Files under `/opt` are free. Everything heavy is in `/opt`.
- **`/opt` is wiped after 15 idle minutes** (the environment is snapshotted; only `/workspace` survives). A cold install is about 2 minutes. Keep a used environment warm with a cheap ping at most every 10 minutes. Environment ids stay valid for 7 days but resolve to an empty `/opt` after idling. Not built yet: the keep-alive.
- **Fresh environment, trivial command**: 10 to 12 s. Tightly scripted call: about 12k tokens. Free-form agent task: about 2 minutes and 70k tokens, so never let the sandbox agent explore.
- **The sandbox agent retypes the command**, so long base64 corrupted once. Files go in as quoted heredocs with a `sha256sum` check; a mismatch prints `PAYLOAD_BAD` and the call is retried (up to 3).
- **Inline `sources` and `repository` sources are accepted only when an environment is created**, not with `environment_id` (400). The Files API is read-only. No other way to push files into a warm environment was found.
- **The sandbox presets** `NODE_OPTIONS=--require global-agent/bootstrap` and a `NODE_PATH` for it. Scripts must append to `NODE_PATH`, never replace it.
- **Big command output is truncated** by the platform (`<truncated N lines>`), so scripts print compact JSON between markers (`@@RESULT@@ ... @@END@@`).
- **Staging directories persist in a warm sandbox**: a fix staged under a reused path was copied into the next run (D-23). Use unique paths and wipe at boot.
- **GitHub API without a token allows 60 requests per hour per IP**, and Octokit's throttling plugin then holds requests for up to an hour. File contents are read from `raw.githubusercontent.com` when there is no token, rate-limit errors fail fast, and the terminal runner accepts `GITHUB_TOKEN`.
- **Env vars are fixed when a sandbox environment is created**: on reuse, new values are ignored and old ones linger. Runs with env vars therefore get a fresh environment that is never reused (D-19).
- **Playwright in the sandbox**: Chromium and WebKit work. Firefox crashes unless `MOZ_DISABLE_CONTENT_SANDBOX=1`. Not installed by the boot script.
- **Locale emulation**: with `locale: "tr-TR"` Chromium does not change the default locale of a no-argument `toLocaleUpperCase()`, WebKit and Firefox do. The demo bug passes the locale explicitly so it reproduces everywhere.
- **Playwright rule**: `browserName` cannot be set inside a `describe`; the prompt tells Argon to set it once at file level when it is not chromium.
- **Automated Embedding is text-only**: screenshots and video must be described by Argon first, then embedded.
- **Atlas Stream Processing has no free tier**: billed while a processor runs. Start it only for the demo window.
- **Next.js 16**: read `node_modules/next/dist/docs/` before writing Next code (the scaffold's `AGENTS.md` says so). Route handlers run at request time when they touch the database. Docker with `output: "standalone"` is supported.
- **Tooling gotchas**: scripts run with `tsx` as CommonJS, so wrap code in an async `main()` (no top-level await). `octokit` is ESM-only, so import it dynamically (`await import("octokit")`). Do not name scripts `.mts` (ESM resolution then breaks extensionless imports).

## Done while the owner was away (24 Oct evening): to review together

Actions that wrote to external systems (all authorised by "do not wait for me to confirm things", but worth a look):
- Pushed to `reproducer-hackathon-demo` `main`: bugs 2 and 3 (commit `5e35bc5`) and bug 4, the search (commit `9c8ec6b`); created issues #2, #3 and #4; created tags `v1-all-bugs` (three bugs) and `v2-four-bugs` (four). `v0-buggy` was created earlier.
- Pushed several commits to `reproducer-hackathon` `main` (all authored as the owner, no attribution lines).
- Used the owner's `gh` login in two ways: `gh issue create` for issues #2 to #4, and `gh auth token` passed as `GITHUB_TOKEN` for **read-only** GitHub API calls in test runs (reading issues and repository files; the unauthenticated limit of 60 requests per hour had been used up). Nothing was written to GitHub with that token. An attempt to open a real pull request with it was blocked by the auto-mode classifier and was not retried.
- Gemini usage: about 15 investigation runs (70k to 110k tokens each), plus probes and tests. All within the modest range; none looped.
- MongoDB: created the search indexes (`bug_memory_vector`, `bug_memory_code`, `bug_memory_search`, `environments_search`) and seeded the device catalog; test data was always deleted; real runs and their events and memory entries remain.
- Gemini Files API: test uploads were deleted; recordings attached to real runs remain for 48 hours.

Decisions made on the owner's behalf: a fourth demo bug (a cousin of bug 1, so memory has something to recall); the "only this issue's profiles must pass" rule (D-24); hand-written GitHub login (D-17); the sandbox agent stays on the default model unless the Argon experiment below says otherwise; deployment files and docs.

Things found and fixed on the way (good stories for the pitch): a stale staging directory leaking one run's fix into the next (D-23); stressor profiles exposing other bugs in the repo (D-24); a Firefox stressor crashing the matrix (D-25); GitHub's unauthenticated quota stalling runs; sandbox environment files disappearing after 15 idle minutes; every sandbox call getting slower with the size of `/workspace` (D-12).

## Waiting for the owner

1. (done) Browser login and a real pull request. PR #5 is still open on the demo repo; close it and delete its branch `reproducer/issue-1-...` before the demo run, or leave it.
3. **Atlas Stream Processing workspace and processor** (needs Atlas access): `docs/STREAM-PROCESSING.md`.
4. **Choose the host** and deploy (`docs/DEPLOY.md`), then add the production OAuth callback.
5. Record the demo (a sped-up recording is acceptable), and write the three submission texts (CHECKPOINTS).

## Next steps, in order

1. Run the three issues again in sequence with a GitHub token so each gets a clean run and `bug_memory` fills up with real entries (the first batch of runs happened before the staging fix, so their diffs were contaminated; their memory entries were deleted). Then check that a later run shows "Seen something similar before" on the timeline.
2. Test the web upload form with a recording in a real browser, and the dashboard cards (memory facets) with real data.
3. Tune the prompts where runs show weak spots (for example the replay plan, which sometimes ends with a vague success criterion).
4. Ideas to cut run time: start the Argon proposal in parallel with the matrix; skip the rebuild when no source changed; an Argon-backed Antigravity agent for the fix step (Q-02).
5. Private repositories are not supported: the sandbox clones over plain HTTPS. The egress allowlist can inject credentials; not tried.
6. Submission (G5): README check from a clean clone, demo video, texts, export everything before the account disappears.

## Incident log

- **24 Oct, daytime**: every Gemini call (Argon, Flash, Antigravity) returned `429 RESOURCE_EXHAUSTED: billing account has exceeded its monthly spending cap`. Not an outage and not our usage (about 2M tokens in total); most likely the shared hackathon billing account. Fixed by the organisers issuing a new key; the new key works (Argon 4 to 7 s, Flash 3 to 4 s, Antigravity fresh environment about 18 s). `withRetry` now throws `SpendingCapError` immediately for this case. **Sandbox environment ids from before the key change belong to the old project and will not work: the first run with the new key is cold (about 2 more minutes for the Playwright install).**

## Event logistics

- Demo may be a sped-up recording; top-10 teams pitch live around 3 pm Sunday (reported by another participant; confirm with the organisers).
- A new Gemini account/key was issued after the spending-cap incident; the DeepMind contact replies to the original email.

## Open questions

See `docs/DECISIONS.md` (Q-02 to Q-06). In short: which model the sandbox agent should use, whether the sandbox can use a stored credential for private repos, whether a custom agent with a base environment helps, video input, and Stream Processing cost.

## Working agreements with the owner

- Commits are authored by the owner (git identity is already configured). **No AI or tool attribution anywhere**: no co-author lines, no "generated with" text, nothing in commit messages, PR text, code or docs.
- Commit and push only when asked. (On the evening of 24 Oct the owner went to sleep for about an hour and said not to wait for confirmations; the assistant then committed and pushed both repos, created issues #2 and #3 and the `v1-all-bugs` tag. Anything new that writes to GitHub or another external system still needs the owner's explicit OK.)
- Never paste secrets into chat; the owner edits `.env.local` themselves.
- Do not claim things work without running them; report measured numbers.
- Keep docs current: decisions go in `DECISIONS.md`, measured behaviour in this file.

## Where things live outside the repo

- `~/Desktop/reproducer-hackathon-demo`: the demo shop (separate git repo).
- `~/Desktop/reproducer-build-plan.md`: the first plan, superseded by `docs/`. Kept for history.
- `~/Desktop/encode-london-hackathon-2026.md`: the challenge briefs (judging criteria, prizes, requirements).
- Hackathon constraints: key must never reach GitHub (project keys get killed), no abuse of the API, account deleted the day after.
