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
- [ ] Atlas storage auto-scaling enabled (needed for Automated Embedding)

## G1. Vertical slice (Saturday midday)

Bug 1 goes from issue text to a green fix end to end, with no UI.

- [x] Understand step returns a profile for "Turkish phone, Chrome"
- [x] Replay under the reporter profile fails, controls pass
- [x] Matrix isolates `locale` as the variable
- [x] Failing test written, fails on reporter profile only
- [x] Fix applied, matrix all green
- [x] Events written to MongoDB (verified: run document plus 12 redacted events, ordered by `seq`)

Measured on 24 Oct (bug 1, terminal runner): warm 187 s, cold 269 s, about 67k tokens.

If this is not green by midday, stop adding features until it is.

## G2. Product shell (Saturday afternoon)

- [x] GitHub login (hand-written OAuth, code complete; the full browser login has not been exercised yet), repo list, issue list
- [x] Ticket form with notes, optional env vars (env vars: see D-19)
- [x] Live timeline from events (polls every 2.5 s)
- [x] Approval card, approve and reject routes, PR creation code. **Verified against a mock GitHub API; not yet against the real one** (needs the owner's login; opening a real PR needs approval)
- [x] Bugs 2, 3 and 4 in the demo repo with issues #2 to #4 (see DEMO-BUGS.md); the agent fixed bugs 1, 2 and 3 end to end (bug 4 rerun pending)

## G3. Inputs and memory (Saturday evening)

- [x] Video input produces steps (tested standalone with a recording; the web upload path is built but not clicked through)
- [x] Text-only works (all runs without a recording). Screenshot: the same upload path as video, not yet tried with an image
- [x] `bug_memory` with Automated Embedding and Vector Search
- [x] Atlas Search with facets (dashboard card; device catalog matching)
- [x] Hybrid search (`$rankFusion`) in the "seen before" step. No rerank step (not found in the skills' references)
- [ ] Deployed and the full flow works in production

## G4. Freeze (Saturday night)

No new features after this point.

- [ ] Stream Processing cluster alerts: app side done, the Atlas processor needs the owner (docs/STREAM-PROCESSING.md)
- [x] Fidelity report (what could not be reproduced, on the approval card and in the PR text)
- [x] Error and stop-and-ask states (not reproduced, no test, attempts exhausted, spending cap, interrupted runs, rate limits)
- [ ] Each bug run five times without flakiness (each bug has been fixed at least twice by the agent; not five times)
- [ ] Recorded fallback run saved outside the sandbox account

## G5. Submit (Sunday morning)

- [ ] README correct, setup instructions tested from a clean clone (README rewritten; the clean-clone test is not done)
- [ ] No secrets in either repo or in git history (full history scanned on 24 Oct evening: clean; scan again before submitting)
- [ ] 3-minute demo video recorded
- [ ] Submission text written per challenge (drafts in docs/SUBMISSION.md, brackets to resolve)
- [ ] Submitted by 11:00
- [ ] Everything worth keeping exported (account deleted the next day)

## Submission text per challenge

**Google DeepMind.** Models and agents used and how: `gemini-4-argon` (understanding, investigation, root cause, fix), Antigravity managed agent (sandbox with Playwright), `gemini-3.8-flash` (summaries). Name the pass/fail signal (the profile matrix and the failing test). Show a live run.

**Agents That Ship.** Tools, steps, where a human approves, how errors are handled, the record of what the agent did (`run_events`).

**MongoDB.** List every Atlas feature used and where. Show MongoDB in use in the video.
