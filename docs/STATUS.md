# Status and handoff

Read this first when picking the project up. It records where things stand, how to run them, what was learned, and what to do next. Last updated Saturday 24 October 2026, early morning (London). Submission closes Sunday 25 October, 12:00 London time.

## What exists

| Piece | State |
|---|---|
| App repo `boranfurkan/reproducer-hackathon` | Next.js 16.4.3 scaffold plus the investigation loop in `src/lib/`. No UI yet, no GitHub login code yet. |
| Demo repo `boranfurkan/reproducer-hackathon-demo` | "Pagefold Books" (React + Express). Bug 1 (Turkish dotless-i) in the code, issue #1 open. Bugs 2 and 3 not written yet. |
| Investigation loop (terminal) | Works end to end on bug 1. Warm: about 187 s. Cold: about 269 s. About 67k tokens. One fix attempt. |
| MongoDB | M10 cluster, storage auto-scaling on, all IPs allowed. Database `reproducer`: six collections and indexes created by `npm run db:setup`. Runs and events are stored (redacted, ordered by a `seq` counter; the first real run's 12 events predate `seq`). No search or vector indexes yet. |
| GitHub OAuth app | Created ("ReProducer"), credentials in `.env.local`. Callback: `http://localhost:3000/api/auth/callback/github`. Add the production callback when the deploy URL exists. |
| Docs | `docs/` (architecture, agent loop, MongoDB, decisions, checkpoints, demo) and this file. |

Nothing has been deployed. No PR has ever been opened by the agent (the loop stops at "approval requested").

## How to run things

```bash
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
  gemini.ts            client, TokenBudget, withRetry (429/503 backoff)
  redact.ts            secret redaction for anything stored or shown
  mongo.ts             single shared client (globalThis), db(), collection(), COLLECTIONS
  events.ts            startRun(): creates the run, returns emit/finish/fail, writes run_events
  agent/
    argon.ts           askJson(): Argon with JSON-schema output, retry on bad JSON
    schemas.ts         JSON schemas and types (Understanding, ReplayPlan, Proposal, ...)
    profiles.ts        BASELINE profile and one-variable ablations
    repo.ts            read the repo's text files from GitHub (octokit via dynamic import)
    investigate.ts     the loop
  harness/scripts.ts   shell and Node scripts that run inside the sandbox
  sandbox/antigravity.ts   AntigravitySandbox (run, runWith, checksummed file writes)
scripts/
  investigate.ts       terminal runner
  setup-db.ts          collections and indexes
skills/                third-party skills (reference material, not our code)
docs/                  documentation
```

## The loop as built (`src/lib/agent/investigate.ts`)

1. In parallel: Argon interprets the issue and the developer's notes into an environment profile; the repo's text files are read from GitHub; the sandbox boots (`boot.sh`: installs Playwright into `/opt` if missing, clones or resets the repo, runs `npm ci` only when the lockfile changed). The replay plan is written as soon as the interpretation and the code are ready, so it overlaps with the boot.
2. Matrix (one sandbox call): the reporter profile, a neutral baseline, and the reporter with one variable reset (engine, locale, timezone, device, storage, colour scheme). Runs in parallel in Playwright. The variable whose reset flips the result is the cause.
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
- **Playwright in the sandbox**: Chromium and WebKit work. Firefox crashes unless `MOZ_DISABLE_CONTENT_SANDBOX=1`. Not installed by the boot script.
- **Locale emulation**: with `locale: "tr-TR"` Chromium does not change the default locale of a no-argument `toLocaleUpperCase()`, WebKit and Firefox do. The demo bug passes the locale explicitly so it reproduces everywhere.
- **Playwright rule**: `browserName` cannot be set inside a `describe`; the prompt tells Argon to set it once at file level when it is not chromium.
- **Automated Embedding is text-only**: screenshots and video must be described by Argon first, then embedded.
- **Atlas Stream Processing has no free tier**: billed while a processor runs. Start it only for the demo window.
- **Next.js 16**: read `node_modules/next/dist/docs/` before writing Next code (the scaffold's `AGENTS.md` says so). Route handlers run at request time when they touch the database. Docker with `output: "standalone"` is supported.
- **Tooling gotchas**: scripts run with `tsx` as CommonJS, so wrap code in an async `main()` (no top-level await). `octokit` is ESM-only, so import it dynamically (`await import("octokit")`). Do not name scripts `.mts` (ESM resolution then breaks extensionless imports).

## Next steps, in order

G1 (vertical slice) is complete: verified on 24 Oct with a real run stored in MongoDB (run document plus 12 redacted events, warm run 189 s, about 67k tokens). Next:

1. **Tag the buggy demo state** (`v0-buggy` on `reproducer-hackathon-demo`) so it can be reset after each run. Needs the owner's approval before pushing.
2. **Product shell (G2)**: check Auth.js works with Next 16, then GitHub login, repo list, issue list, ticket form (notes, optional env vars, optional video), start-run route handler, live timeline (read `run_events`; change stream or polling), approval card, Octokit branch, commit and PR, `approvals` collection. The orchestrator must run in the long-lived server process, not a serverless function.
3. **Demo repo**: write bug 2 (blocked storage) and bug 3 (timezone day boundary) with realistic issues. Bug designs are in DECISIONS D-08 and the original plan.
4. **Mongo layers (G3)**: `tickets` and `bug_memory` writes, `autoEmbed` vector index (`voyage-4` for text, `voyage-code-4` for diffs), vector search, Atlas Search with facets, hybrid search with rerank in the "seen this before?" step, `environments` catalog, then Stream Processing last.
5. **Video input**: not tested at all (Q-05). Needs a clip, the size limit, and latency.
6. **Sandbox keep-alive and warm pool** for the app; fidelity report; stop-and-ask UI states.
7. **Deploy**: Docker image with `output: "standalone"` (Cloud Run with min instances 1, or Railway/Fly/Render), add the production OAuth callback, rotate nothing in the repo (keys are env vars only).
8. **Submission (G5)**: README check from a clean clone, demo video, text per challenge (see CHECKPOINTS), export everything before the account disappears.

Ideas to cut run time further (currently about 187 s warm): start the Argon proposal in parallel with the matrix using only the suspected variables; skip the rebuild when no source changed; pre-warm the Playwright web server between the red and green runs.

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
