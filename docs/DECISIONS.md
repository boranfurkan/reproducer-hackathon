# Decisions and open questions

Short log. Newest first within each section. Change a decision by adding a new entry that supersedes it.

## Decided

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

**Q-01. Do sandbox environments keep their files?** Docs say an idle environment is snapshotted after 15 minutes and resumable for 7 days. In testing, an hour-old environment id resolved but `/opt/pw` and the Playwright browsers were gone. A test (install under `/workspace`, idle 17 minutes, check) is in progress. Until answered, run `ensureReady()` before every demo run.

**Q-02. Which model runs inside the sandbox agent?** The Antigravity agent defaults to `gemini-3.8-flash`. Argon can be selected with `agent_config.model`. Likely answer: flash for the shell-runner calls (cheap, fast), and an Argon-backed agent only for the bounded fix step if it is fast enough. Measure before deciding.

**Q-03. Give the sandbox repo access without exposing the GitHub token.** Antigravity has a credentials feature and per-domain header injection in the egress allowlist. Not tested yet.

**Q-04. Custom agent with a base environment.** A custom agent can fork a base environment on each call, and sources can mount a GitHub repository at a path. This may be a cleaner way to get a clean checkout per run. Not tested yet.

**Q-05. How long does video analysis take, and what is the size limit?** Not tested yet.

**Q-06. Cost of Atlas Stream Processing.** Check the pricing for the smallest tier before starting a workspace.

## Account constraints (from the organisers' handout)

- The account and project are temporary and deleted about the day after the hackathon. Export the repo, demo video and anything else worth keeping.
- If the API key reaches GitHub, all keys on the project are killed. History counts, so a later commit does not fix a leak.
- Abuse (for example thousands of requests) can lead to disqualification. Keep call counts modest.
- New models return 503 under load. Retry with backoff.
