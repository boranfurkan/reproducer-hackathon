# Agent loop

The orchestrator (Argon) decides. The sandbox only executes short, pre-written commands.

## Steps

1. **Understand.** Read the issue text, the developer's notes and the video or screenshot. Output a structured interpretation: steps, expected vs. actual, suspected environment. Shown to the developer before anything runs.
2. **Profile.** Produce an `EnvProfile` for the reporter. Look up known devices in the `environments` catalog first; invent a profile if none matches.
3. **Memory.** Run hybrid search over `bug_memory` ("seen this before?") and give the top hits to Argon as hints, not answers.
4. **Boot.** Make sure the sandbox is ready (`ensureReady`), clone the repo, read the README and `package.json`, install and start the app. Env vars go to the sandbox only.
5. **Replay.** Run the steps under the reporter's profile and under two or three control profiles in one sandbox call.
6. **Investigate.** If the bug only shows for the reporter, find out which environment variable matters:
   - Argon lists hypotheses (locale, timezone, storage, engine, DPR, touch, motion...).
   - Run a matrix that varies one variable at a time. Read the pass/fail table.
   - Repeat until one variable is isolated. Capped at `LIMITS.maxMatrixRounds`.
7. **Root cause.** Trace the isolated variable into the code with the repo in context.
8. **Failing test.** Write a Playwright test parameterised by profile. It must fail on the reporter's profile and pass on the controls.
9. **Fix loop.** Patch, run the whole matrix, read failures, repeat. Capped at `LIMITS.maxFixAttempts`.
10. **Fidelity report.** List what was emulated and what was not.
11. **Approval.** Stop. Wait for the developer.
12. **Pull request.** Branch, commit, PR with "Fixes #N". `gemini-3.8-flash` writes the description. Record the run in `bug_memory`.

## Stop conditions

Every one of these ends in a report to the developer and a question, never a silent failure:
- Cannot reproduce after the allowed matrix rounds.
- Test is flaky across repeated runs.
- Fix attempts exhausted.
- Token budget reached.
- Sandbox or API unavailable after retries.

## Events

Each step writes a `run_events` document (type, short summary, optional data). The UI timeline reads these. Event types are defined in `src/lib/types.ts`. Secrets are redacted before writing.

## Cost and latency budget

- Sandbox call: about 22 s for a tightly scripted command. Plan for roughly six calls in a live run.
- Per-run token cap in `LIMITS.maxTokensPerRun`.
- Matrix profiles run in parallel inside one call, not one call per profile.
