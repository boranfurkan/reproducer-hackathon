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
- [ ] Events written to MongoDB

Measured on 24 Oct (bug 1, terminal runner): warm 187 s, cold 269 s, about 67k tokens.

If this is not green by midday, stop adding features until it is.

## G2. Product shell (Saturday afternoon)

- [ ] GitHub login, repo list, issue list
- [ ] Ticket form with notes, optional env vars
- [ ] Live timeline from events
- [ ] Approval card, branch, commit, PR opens against the demo repo
- [ ] Bugs 2 and 3 added to the demo repo with issues, both fixed end to end

## G3. Inputs and memory (Saturday evening)

- [ ] Video input produces steps
- [ ] Screenshot and text-only fallbacks work
- [ ] `bug_memory` with Automated Embedding and Vector Search
- [ ] Atlas Search with facets
- [ ] Hybrid search with rerank in the "seen before" step
- [ ] Deployed and the full flow works in production

## G4. Freeze (Saturday night)

No new features after this point.

- [ ] Stream Processing cluster alerts (only if G3 is stable)
- [ ] Fidelity report
- [ ] Error and stop-and-ask states
- [ ] Each bug run five times without flakiness
- [ ] Recorded fallback run saved outside the sandbox account

## G5. Submit (Sunday morning)

- [ ] README correct, setup instructions tested from a clean clone
- [ ] No secrets in either repo or in git history
- [ ] 3-minute demo video recorded
- [ ] Submission text written per challenge (see below)
- [ ] Submitted by 11:00
- [ ] Everything worth keeping exported (account deleted the next day)

## Submission text per challenge

**Google DeepMind.** Models and agents used and how: `gemini-4-argon` (understanding, investigation, root cause, fix), Antigravity managed agent (sandbox with Playwright), `gemini-3.8-flash` (summaries). Name the pass/fail signal (the profile matrix and the failing test). Show a live run.

**Agents That Ship.** Tools, steps, where a human approves, how errors are handled, the record of what the agent did (`run_events`).

**MongoDB.** List every Atlas feature used and where. Show MongoDB in use in the video.
