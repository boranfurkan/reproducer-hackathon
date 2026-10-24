# Decisions and open questions

Short log. Newest first within each section. Change a decision by adding a new entry that supersedes it.

## Decided

**D-23. Staging directories are unique per call, and boot wipes `/opt/stage`.** Bug found 24 Oct: the fix step copied `/opt/stage/a1/fix/.` into the repo, and that directory survives in a warm sandbox, so the previous run's fix (`src/prefs.js`) was copied into the next run. The "verified" state and the diff on the approval card were contaminated (the fix files themselves were right). Always assume the sandbox keeps files from earlier runs.

**D-22. Verified fixes become memory; recall is a hybrid search.** After a run is verified, `bug_memory` stores the symptom, root cause, file, isolating variable, environment and diff. Before proposing a fix, the loop recalls similar past bugs with `$rankFusion` over a `$vectorSearch` (Automated Embedding, voyage-4, weight 0.7) and a lexical `$search` (weight 0.3); the hits go into the prompt as hints and appear on the timeline ("Memory"). A second `autoEmbed` index (voyage-code-4 on the diff) feeds "Similar past fixes" on the approval card. `$searchMeta` facets (isolating variable, engine, locale) feed the dashboard card "What it has learned". Everything degrades to an empty result if an index is unavailable. Server is 8.0.34, so `$rankFusion` works and `$scoreFusion` (8.3+) does not.

**D-21. A device catalog turns notes into realistic profiles.** `environments` holds 10 devices (Z Flip, S24, Pixel, iPhone, iPad, MacBook M4 in Safari and Chrome, Windows laptop at 125% scaling, 23 inch 1080p desktop, Firefox) with aliases. Atlas Search (fuzzy text over name and aliases) matches the developer's free text ("Samsng Galaxy Z Flip", "windows pc 23 inch monitor with nvidia rtx3060", "macbook m4 pro"); the matches are given to Argon as known-good profiles. Verified matching on typos and on the owner's own phrasing.

**D-20. Recordings and screenshots go through the Gemini Files API.** `POST /api/uploads` (multipart, 50 MB, mp4/webm/mov/png/jpg/webp) stores the file with `ai.files.upload`, waits for ACTIVE, and returns a reference that the ticket carries to Argon (`{type: "video", uri, mime_type}` inside the `input` array). A media reference from the browser is only trusted if its uri starts with `https://generativelanguage.googleapis.com/`. Measured with a 150 KB phone recording: upload 2 s, processing 2 s, Argon 7.6 s, 921 tokens; it listed the exact steps, the symptom and environment clues (portrait phone, touch, a Turkish label) correctly.

**D-19. A run with env vars gets its own fresh sandbox environment, never reused.** Measured: sandbox env vars are fixed when the environment is created; on reuse, changed values are ignored (a run still printed the old value) and the old values linger. Reusing would run with stale values and could leak one user's variables to the next. So `runner.ts` skips the warm environment when env vars are present and does not remember that environment. Cost: a cold install (about 2 minutes) for those runs.

**D-18. Pages are client components that fetch from route handlers.** With `cacheComponents`, reading cookies in a server-rendered page needs a Suspense boundary; fetching on the client avoids that. Pages that read the URL (`useParams`) are wrapped in `<Suspense>` in their `page.tsx`. Route handlers read the encrypted session cookie.

**D-17. GitHub login is hand-written, not Auth.js.** The flow is short (authorize with a `state` cookie, exchange the code, read the profile, set an AES-256-GCM encrypted session cookie holding the token, 7 hours), and it avoids a compatibility risk with Next.js 16. The callback path is `/api/auth/callback/github`, matching the registered OAuth app. Scope: `repo read:user`. The token never reaches the browser (`/api/session` returns only the profile).

**D-16. The matrix tests conditions the report never mentioned (stressors).** A real cause is often something the ticket does not say (blocked storage in an in-app browser, a US timezone). Argon proposes up to 3 stressors; each is applied on top of the reporter's profile and replayed. If the reporter's profile passes but one stressor fails, that stressor is the cause and the test uses that profile. Stressors are validated before use (valid IANA timezone and locale tag, known fields only, no-ops dropped). The harness launches one browser per engine and one context per profile, so up to 9 profiles run in one call. Assertions must hold in every locale: `expect_text` accepts `/regex/`.

**D-14. Files reach the sandbox as checksummed heredocs, not base64 and not inline sources.** The sandbox agent retypes every command, and a long base64 string was corrupted once (`base64: invalid input`). Inline `sources` deliver files exactly but are only accepted when an environment is created (a 400 on reuse), and the Files API is read-only. So each file is written from a quoted heredoc and verified with `sha256sum` in the same command; a mismatch aborts with `PAYLOAD_BAD` before any work and the call is retried (up to 3).

**D-13. One Argon call returns root cause, failing test and fix; one sandbox call verifies all of it.** The sandbox call resets the clone, adds the test (must be red: 1 failed, 1 passed), applies the fix, runs all tests and the matrix, and prints the diff. Wrong first attempts feed the output back to Argon (cap `LIMITS.maxFixAttempts`). Measured: cold 269 s, warm 187 s, about 67k tokens, 3 sandbox calls (boot 34 s, matrix 39 s, verify 93 s).

**D-12. Heavy files go in `/opt`, not `/workspace`.** Measured: every byte under `/workspace` adds about 40 ms per MB to every sandbox call (600 MB: calls 30 s instead of 12 s; our 1.1 GB of browsers: 57 s per call). Files under `/opt` cost nothing. Price: `/opt` is wiped after 15 idle minutes, so keep the environment warm (a cheap ping at least every ~10 minutes while the app is live) and expect a one-time install of about 2 minutes after idling. Supersedes D-11.

**D-11 (superseded by D-12). Everything the sandbox needs lives under `/workspace`.** Tested: after 17 idle minutes (snapshot) only `/workspace` survived; `/opt` and `/root` were wiped. Playwright and its browsers installed under `/workspace` (with `PLAYWRIGHT_BROWSERS_PATH=/workspace/browsers`) launched Chromium and WebKit after the idle period. `ensureReady()` checks and reinstalls only if missing.

**D-10. Two repos.** `reproducer-hackathon` is the app. `reproducer-hackathon-demo` is the target app (a bookshop with realistic bugs and GitHub Issues). The agent opens PRs against the demo repo, never against itself.

**D-09. Tickets come from GitHub Issues.** The user picks a repo, then an open issue. The form adds what an issue lacks: environment notes, a video, env vars.

**D-08. Bugs are environment-specific and hard to spot on a developer machine.** Demo bugs: Turkish dotless-i (explicit locale in `toLocaleUpperCase`), blocked storage (Safari private mode), timezone day boundary. Locale must be passed explicitly in the demo code so it reproduces in every engine.

**D-07. Argon plans, the sandbox executes.** Free-form sandbox tasks took about 118 s and 70k tokens; a tight one-command call took about 22 s and 12k tokens. The sandbox agent runs exact commands only.

**D-06. Screenshots and video become text before embedding.** Automated Embedding is text only.

**D-05. Next.js, deployed as a container.** Not serverless. Reason: multi-minute runs and a live event stream.

**D-04. Use every listed Atlas feature.** Automated Embedding, Vector Search, Atlas Search, Hybrid Search, Stream Processing (last, started only for the demo).

**D-03. Human approval gate before any external action.** PR creation needs an explicit click and is recorded in `approvals`.

**D-02. Antigravity first, Docker fallback.** Sandbox interface isolates the choice.

**D-01. Solo, no cuts, vertical slice first.** Order: loop for one bug, then product shell, then Mongo layers, then video input, then polish.

## Open questions

**Q-02. Which model runs inside the sandbox agent?** (Currently the default, gemini-3.8-flash, as a remote shell.) The Antigravity agent defaults to `gemini-3.8-flash`. Argon can be selected with `agent_config.model`. Likely answer: flash for the shell-runner calls (cheap, fast), and an Argon-backed agent only for the bounded fix step if it is fast enough. Measure before deciding.

**Q-03. Give the sandbox repo access without exposing the GitHub token.** Antigravity has a credentials feature and per-domain header injection in the egress allowlist. Not tested yet.

**Q-04. Custom agent with a base environment.** A custom agent can fork a base environment on each call, and sources can mount a GitHub repository at a path. This may be a cleaner way to get a clean checkout per run. Not tested yet.

**Q-05. (answered, see D-20)** Video: about 8 s for a short clip; limit 50 MB in our upload route (Files API allows more). Not yet tested through the web form or with a long recording.

**Q-06. Cost of Atlas Stream Processing.** Check the pricing for the smallest tier before starting a workspace.

## Account constraints (from the organisers' handout)

- The account and project are temporary and deleted about the day after the hackathon. Export the repo, demo video and anything else worth keeping.
- If the API key reaches GitHub, all keys on the project are killed. History counts, so a later commit does not fix a leak.
- Abuse (for example thousands of requests) can lead to disqualification. Keep call counts modest.
- New models return 503 under load. Retry with backoff.
