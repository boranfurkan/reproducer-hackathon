# Agent loop

The orchestrator (Argon) decides. The sandbox only executes short, pre-written commands. Code: `src/lib/agent/investigate.ts`.

## Steps

1. **Understand, in parallel with the boot.**
   - The developer's notes are matched against the device catalog (Atlas Search, fuzzy) so "Samsung Flip Z" becomes concrete numbers.
   - Argon reads the issue, the notes, the matched devices and any attached recording or screenshot, and returns: a summary, expected and actual behaviour, what the recording shows (steps, symptom, environment clues), an environment profile, and up to 3 **stressors** (extra conditions the report does not mention but that could explain "only some users").
   - The repository's text files are read from GitHub.
   - The sandbox boots (`boot.sh`): Playwright is installed into `/opt` if missing, the repository is cloned or reset, dependencies are installed if the lockfile changed.
2. **Replay plan.** Argon writes a short list of browser steps ending in assertions that describe the **correct** behaviour (so the plan fails when the bug is present), valid in every locale and timezone (`expect_text` accepts `/regex/`). It runs while the sandbox is still booting.
3. **Matrix** (one sandbox call, up to 9 profiles, one browser per engine): the reporter's profile, a neutral baseline, the reporter with one variable reset (engine, locale, timezone, device, storage, colour scheme), and the reporter with each stressor added.
   - If the reporter fails: the variable whose reset makes it pass is the cause.
   - If the reporter passes but a stressor profile fails: the added condition is the cause, and the failing profile is used from here on.
   - If nothing fails: stop, "not reproduced".
4. **What belongs to this issue.** A profile is *required* if it passed in round 1, is the failing profile, or failed with the same signature (same failed step, same first console error). Profiles that failed differently are **other problems** (probably other bugs): reported on the timeline, the run page and the PR text, and the model is told not to fix them.
5. **Memory.** `recallSimilar`: hybrid search (`$rankFusion`: Automated Embedding vector search plus lexical search) over verified past fixes. Hits go on the timeline ("Seen something similar before") and into the prompt as hints.
6. **Proposal.** One Argon call (thinking level high) returns: the root cause (file and explanation), a Playwright test, and a candidate fix (changed files with full contents). The test has two cases: the failing profile (must fail before the fix) and a default-profile control (must pass).
7. **Verification.** One sandbox call: reset the clone, add the test and run it (must be red: 1 failed, 1 passed), apply the fix, run all tests (must be green), re-run the matrix, print the diff. Files are staged under a unique directory and copied into place in that order.
8. **Retry.** If the test is not red, the tests fail, or a required profile still fails, the output goes back to Argon for another attempt, up to `LIMITS.maxFixAttempts` (3).
9. **Stop at approval.** The run ends at `approval_requested`. The developer reviews the root cause, diff, test, what could not be emulated and similar past fixes.
10. **Memory and PR.** On finish, a verified fix is stored in `bug_memory`. Only after the developer clicks Approve does the web app create a branch, commit the fix and the test, and open the pull request (`Fixes #N`, root cause, how it was reproduced, the matrix, other problems seen, a short summary written by `gemini-3.8-flash`).

## Stop conditions

Each of these ends in a report to the developer, never a silent failure or a guess:
- Not reproduced under the reporter's profile or any extra condition.
- A valid failing test could not be produced.
- The fix attempts are exhausted.
- The token budget is reached.
- The billing cap is reached (`SpendingCapError`, no retry).
- The sandbox or API is unavailable after retries.

## Events

Every step writes a `run_events` document (`seq`, `atMs`, type, summary, optional data), redacted and size-capped. Types: `understood`, `profile`, `boot`, `hypothesis`, `memory`, `matrix`, `root_cause`, `test_written`, `fix_attempt`, `green`, `approval_requested`, `pr_opened`, `stopped`. The run page reads them in order; the first `profile` event also writes the `tickets` document that the stream processor watches.

## Cost and latency

Measured on the demo bugs: about 3 to 6 minutes and 70k to 110k tokens per investigation (cold sandbox about 2 minutes longer). Sandbox calls dominate: boot about 35 to 50 s warm, matrix about 40 s, verification about 100 s. Argon calls are 5 to 25 s each. Caps: `LIMITS` in `src/lib/config.ts`. Per user: 2 running investigations, 12 per hour.
