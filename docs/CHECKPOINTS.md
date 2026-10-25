# Checkpoints

Submission closes **Sunday 25 October 2026, 12:00 London time**. Aim to submit by 11:00. Each gate must pass before starting the next block. If a gate fails, fix it or cut scope after it; do not skip it.

## G0. Foundations (Friday night)

- [x] Argon works on the hackathon key
- [x] Antigravity runs shell commands
- [x] Playwright runs in the sandbox (Chromium, WebKit)
- [x] Exit codes and output parsed correctly by `AntigravitySandbox`
- [x] Demo repo exists with bug 1 and issue #1
- [x] App scaffolded, typechecks, lint clean
- [x] Sandbox persistence question answered (D-11: only `/workspace` persists)
- [x] MongoDB Atlas cluster created (M10), `MONGODB_URI` set and connection verified
- [x] GitHub OAuth app created, credentials in `.env.local`
- [x] Atlas storage auto-scaling enabled (needed for Automated Embedding, which works)

## G1. Vertical slice (Saturday midday)

Bug 1 goes from issue text to a green fix end to end, with no UI.

- [x] Understand step returns a profile for "Turkish phone, Chrome"
- [x] Replay under the reporter profile fails, controls pass
- [x] Matrix isolates `locale` as the variable
- [x] Failing test written, fails on reporter profile only
- [x] Fix applied, matrix all green
- [x] Events written to MongoDB (verified: run document plus 12 redacted events, ordered by `seq`)

Measured on 24 Oct (bug 1, terminal runner): warm 187 s, cold 269 s, about 67k tokens.

## G2. Product shell (Saturday afternoon)

- [x] GitHub login (hand-written OAuth; exercised in the browser by the owner on 24 Oct), repo list, issue list
- [x] Ticket form with notes, optional env vars (env vars: see D-19)
- [x] Live timeline from events (a MongoDB change stream since D-32; a poll is the fallback)
- [x] Approval card, approve and reject routes, PR creation (tested against a mock GitHub API, then a real pull request from the Approve button: PR #5 on the demo repo)
- [x] Demo bugs with issues in the demo repo, fixed end to end by the agent (first set #1 to #4 on 24 Oct, now retired; the current set #8 to #12, see DEMO-BUGS.md)

## G3. Inputs and memory (Saturday evening)

- [x] Video input produces steps and timestamped moments (tested standalone and at the API level; the web upload form has not been clicked through)
- [x] Text-only, screen recording and screenshot inputs all work end to end
- [x] `bug_memory` with Automated Embedding and Vector Search
- [x] Atlas Search with facets (dashboard card; device catalog matching)
- [x] Hybrid search (`$rankFusion`) in the "seen before" step, with a measured similarity threshold instead of a rerank step
- [ ] Deployed and the full flow works in production (not needed for the submission: the demo is recorded locally)

## G4. Freeze (Saturday night, moved to Sunday early morning)

The owner chose to keep building overnight (the deep investigation and the new demo bugs); the freeze moved to Sunday morning.

- [x] Stream Processing cluster alerts: running on Atlas (docs/STREAM-PROCESSING.md)
- [x] Fidelity report (what could not be reproduced, on the approval card and in the PR text)
- [x] Error and stop-and-ask states (not reproduced, no test, attempts exhausted, spending cap, interrupted runs, rate limits, Stop)
- [x] Each bug run repeatedly without flakiness: first set 11 of 11 runs fixed on the first attempt (24 Oct); current set 5 of 5 deep runs fixed and verified (25 Oct, #8 on its second fix attempt), after earlier runs exposed the sandbox resets that are now repaired in-call
- [x] Recorded fallback run: a finished deep run of every demo issue is kept in MongoDB and shown in the app

## G5. Submit (Sunday morning)

- [x] README correct, setup instructions tested from a clean clone (24 Oct; README rewritten for the deep mode on 25 Oct)
- [x] No secrets in either repo or in git history (both histories scanned on 25 Oct morning: only placeholders and test fixtures)
- [ ] 3-minute demo video recorded
- [ ] Submission text final per challenge (docs/SUBMISSION.md: only the video link is left)
- [ ] Submitted by 11:00
- [ ] Everything worth keeping exported (account deleted the next day)
- [ ] After the presentation: stream processor stopped, Atlas password of `furkanboran` changed

## Submission text per challenge

**Google DeepMind.** Models and agents used and how: `gemini-4-argon` (understanding, deep investigation with a million-token context and tools, root cause, fix, explanation), Antigravity managed agent on Argon (sandbox with Playwright), `gemini-3.8-flash` (triage, summaries, reply drafts, Ask the memory). Name the pass/fail signal (the profile matrix and the failing test). Show a live run.

**Agents That Ship.** Tools, steps, where a human approves, how errors are handled, the record of what the agent did (`run_events`).

**MongoDB.** List every Atlas feature used and where. Show MongoDB in use in the video.
