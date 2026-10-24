# Status and handoff

Read this first when picking the project up. It records where things stand, how to run them, what was learned, and what to do next. Last updated Saturday 24 October 2026, evening (London). Submission closes Sunday 25 October, 12:00 London time.

## What exists

| Piece | State |
|---|---|
| App repo `boranfurkan/reproducer-hackathon` | Next.js 16.4.3. The investigation loop in `src/lib/`, and the product shell: GitHub login, repo and issue pickers, ticket form, live run page with timeline, approval card, approve and reject routes, pull request creation. Builds, typechecks and lints clean. |
| Demo repo `boranfurkan/reproducer-hackathon-demo` | "Pagefold Books" (React + Express). **Pushed**: bug 1 (Turkish dotless-i), issue #1, tag `v0-buggy`. **Local only, not pushed**: bug 2 (blank page when storage is blocked) and bug 3 (wrong pickup day west of UTC), plus the features they live in. See DEMO-BUGS.md. |
| Investigation loop | Works end to end on bug 1 (warm about 187 s, cold about 269 s, about 67k tokens). Since then extended with stressors (D-16); **the extended loop has not been run against a real sandbox yet**, only unit-checked. |
| MongoDB | M10 cluster, storage auto-scaling on, all IPs allowed. Database `reproducer`: six collections and indexes (`npm run db:setup`). Runs and events stored (redacted, ordered by `seq`). No search or vector indexes yet. |
| GitHub OAuth app | Created ("ReProducer"), credentials in `.env.local`. Callback `http://localhost:3000/api/auth/callback/github`. Add the production callback when the deploy URL exists. |
| Docs | `docs/` (architecture, agent loop, MongoDB, decisions, checkpoints, demo, demo bugs) and this file. |

Nothing has been deployed. No pull request has ever been opened by the app (the code exists, untested against GitHub).

### Verified vs not verified (24 Oct evening)

Verified: production build; unauthenticated behaviour of every route; the login redirect and state check; authenticated routes with a forged test session against MongoDB (ownership isolation, event ordering, approval gating, token never exposed, tampered cookie rejected); stressor validation; the harness locally against the demo shop (bugs 2 and 3 reproduce only under the intended condition); env vars in the sandbox.

Not verified: a real browser login with GitHub; `GET /api/repos` and the issues route with a real token; starting a run from the UI end to end; pull request creation (`openFixPullRequest`, `buildPrBody` including the flash summary); the stressor path of the loop in a real sandbox; the keep-alive timer; the UI visually (it has been compiled, not looked at in a browser).

## How to run things

```bash
npm run dev                       # the web app on http://localhost:3000 (log in with GitHub)
npm ci && npx next typegen        # after a fresh clone or if node_modules/.next were deleted (typegen creates the LayoutProps types that tsc needs)
npm run typecheck                 # tsc --noEmit
npx eslint src scripts            # lint
npm run db:setup                  # create collections and indexes (safe to repeat)
npm run investigate -- 1 --notes "Samsung Galaxy Z Flip, Chrome on Android, phone language is Turkish, customer is in Istanbul"
npm run investigate -- 1 --env <sandbox environment id> --notes "..."   # reuse a warm sandbox (skips the install)
npm run investigate -- 1 --no-db  # do not write to MongoDB
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

1. In parallel: Argon interprets the issue and the developer's notes into an environment profile; the repo's text files are read from GitHub; the sandbox boots (`boot.sh`: installs Playwright into `/opt` if missing, clones or resets the repo, runs `npm ci` only when the lockfile changed). The replay plan is written as soon as the interpretation and the code are ready, so it overlaps with the boot.
2. Matrix (one sandbox call, up to 9 profiles, one browser per engine): the reporter profile, a neutral baseline, the reporter with one variable reset (engine, locale, timezone, device, storage, colour scheme), and the reporter with up to 3 extra conditions added (stressors proposed by Argon, e.g. storage blocked, another timezone). If the reporter fails, the variable whose reset flips the result is the cause. If only a stressor profile fails, that added condition is the cause and the test runs under that profile.
3. One Argon call (thinking level high) returns root cause, a Playwright test, and a candidate fix.
4. One sandbox call verifies: reset the clone, add the test (must be red: 1 failed, 1 passed), apply the fix, run all tests, re-run the matrix, print the diff.
5. If a check fails, the output goes back to Argon and it tries again, up to `LIMITS.maxFixAttempts` (3).
6. Stops at `approval_requested`. The PR step does not exist yet.

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
- **Env vars are fixed when a sandbox environment is created**: on reuse, new values are ignored and old ones linger. Runs with env vars therefore get a fresh environment that is never reused (D-19).
- **Playwright in the sandbox**: Chromium and WebKit work. Firefox crashes unless `MOZ_DISABLE_CONTENT_SANDBOX=1`. Not installed by the boot script.
- **Locale emulation**: with `locale: "tr-TR"` Chromium does not change the default locale of a no-argument `toLocaleUpperCase()`, WebKit and Firefox do. The demo bug passes the locale explicitly so it reproduces everywhere.
- **Playwright rule**: `browserName` cannot be set inside a `describe`; the prompt tells Argon to set it once at file level when it is not chromium.
- **Automated Embedding is text-only**: screenshots and video must be described by Argon first, then embedded.
- **Atlas Stream Processing has no free tier**: billed while a processor runs. Start it only for the demo window.
- **Next.js 16**: read `node_modules/next/dist/docs/` before writing Next code (the scaffold's `AGENTS.md` says so). Route handlers run at request time when they touch the database. Docker with `output: "standalone"` is supported.
- **Tooling gotchas**: scripts run with `tsx` as CommonJS, so wrap code in an async `main()` (no top-level await). `octokit` is ESM-only, so import it dynamically (`await import("octokit")`). Do not name scripts `.mts` (ESM resolution then breaks extensionless imports).

## Pending approvals (the owner asked for no commits or pushes while away)

1. **Commit and push the app repo's uncommitted work** (everything since `950c12a`: stressors, harness changes, the whole product shell, docs).
2. **Commit and push the demo repo's bugs 2 and 3** (`src/prefs.js`, `src/format.js`, `src/Reserve.jsx`, API changes, `tests/reservation.spec.js`), create their issues (texts in DEMO-BUGS.md), then tag the full set (suggested `v1-all-bugs`).
3. Opening a real pull request for the first time (a test of `openFixPullRequest`) writes to a real repo: do it on the demo repo with the owner present.

## Next steps, in order

1. After approval 1 and 2: run the extended loop on bugs 2 and 3 (`npm run investigate -- 2 --notes "iPhone, opened from an in-app browser, language English (UK)"`, then issue 3) and tune the prompts. The stressor path is the part most likely to need tuning. Check that bug 1 still works.
2. **Log in through the browser** (`npm run dev`, then http://localhost:3000) and click through: repos, issues, ticket form, run page, approve. Fix whatever breaks. Look at the UI.
3. **Mongo layers (G3)**: `tickets` and `bug_memory` writes, `autoEmbed` vector index (`voyage-4` for text, `voyage-code-4` for diffs), vector search, Atlas Search with facets, hybrid search with rerank in the "seen this before?" step (insert it before the proposal call), `environments` catalog, then Stream Processing last.
4. **Video input**: not tested at all (Q-05). Needs a clip, the size limit, and latency. Add an upload to the ticket form; Argon describes the clip into steps.
5. **Deploy**: Docker image with `output: "standalone"` (Cloud Run with min instances 1, or Railway/Fly/Render), production OAuth callback, `KEEP_SANDBOX_WARM=true`, env vars from the host only.
6. **Submission (G5)**: README check from a clean clone, demo video (a sped-up recording is acceptable), text per challenge (see CHECKPOINTS), export everything before the account disappears.

Known gaps and ideas: private repositories are not supported by the sandbox (it clones over plain HTTPS); the PR step commits the fix files and `tests/repro.spec.js` only; the fix loop caps at 3 attempts; the pickup of the run by the UI relies on polling (a change stream would be nicer); further run-time ideas are in the older notes below.

Ideas to cut run time further (about 187 s warm before stressors): start the Argon proposal in parallel with the matrix; skip the rebuild when no source changed.

## Incident log

- **24 Oct, daytime**: every Gemini call (Argon, Flash, Antigravity) returned `429 RESOURCE_EXHAUSTED: billing account has exceeded its monthly spending cap`. Not an outage and not our usage (about 2M tokens in total); most likely the shared hackathon billing account. Fixed by the organisers issuing a new key; the new key works (Argon 4 to 7 s, Flash 3 to 4 s, Antigravity fresh environment about 18 s). `withRetry` now throws `SpendingCapError` immediately for this case. **Sandbox environment ids from before the key change belong to the old project and will not work: the first run with the new key is cold (about 2 more minutes for the Playwright install).**

## Event logistics

- Demo may be a sped-up recording; top-10 teams pitch live around 3 pm Sunday (reported by another participant; confirm with the organisers).
- A new Gemini account/key was issued after the spending-cap incident; the DeepMind contact replies to the original email.

## Open questions

See `docs/DECISIONS.md` (Q-02 to Q-06). In short: which model the sandbox agent should use, whether the sandbox can use a stored credential for private repos, whether a custom agent with a base environment helps, video input, and Stream Processing cost.

## Working agreements with the owner

- Commits are authored by the owner (git identity is already configured). **No AI or tool attribution anywhere**: no co-author lines, no "generated with" text, nothing in commit messages, PR text, code or docs.
- Commit and push only when asked.
- Never paste secrets into chat; the owner edits `.env.local` themselves.
- Do not claim things work without running them; report measured numbers.
- Keep docs current: decisions go in `DECISIONS.md`, measured behaviour in this file.

## Where things live outside the repo

- `~/Desktop/reproducer-hackathon-demo`: the demo shop (separate git repo).
- `~/Desktop/reproducer-build-plan.md`: the first plan, superseded by `docs/`. Kept for history.
- `~/Desktop/encode-london-hackathon-2026.md`: the challenge briefs (judging criteria, prizes, requirements).
- Hackathon constraints: key must never reach GitHub (project keys get killed), no abuse of the API, account deleted the day after.
