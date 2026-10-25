# Agent loop

The orchestrator (Argon) decides. The sandbox only executes short, pre-written commands, and its browsers give the pass/fail signal. Code: `src/lib/agent/investigate.ts`, the deep phase in `src/lib/agent/deep.ts`.

## Steps

1. **Understand, in parallel with the boot.**
   - The developer's notes are matched against the device catalog (Atlas Search, fuzzy) so "iPhone 8 she never updated" becomes concrete numbers.
   - Argon reads the issue, the notes, the matched devices and any attached recording or screenshot, and returns: a summary, expected and actual behaviour, what the recording shows (steps, symptom, environment clues, timestamped key moments), an environment profile, and up to 5 **stressors** (extra conditions the report does not mention but that could explain "only some users": page translation, a content blocker, reduced motion, an older engine without newer APIs, another timezone, blocked storage, a slow network).
   - The repository's file tree and text files are read from GitHub.
   - The sandbox is usually already warm (the warm-up starts when the repository is opened). Otherwise `boot.sh` installs Playwright into `/opt`, clones or resets the repository and installs dependencies if the lockfile changed; WebKit's system libraries finish in the background.
2. **Replay plan.** Argon writes a short list of browser steps ending in assertions that describe the **correct** behaviour (so the plan fails when the bug is present), valid in every locale and timezone (`expect_text` accepts `/regex/`; also `expect_hidden`, counts). It is written while the sandbox is still booting.
3. **Matrix, round 1** (one sandbox call, up to 13 profiles, every profile in Chromium and WebKit, four pages at a time per engine): the reporter's profile, a neutral baseline, the reporter with one variable reset (engine, locale, timezone, device, storage, colour scheme, reduced motion and the other conditions), and the reporter with each stressor added.
   - If the reporter fails: the variable whose reset makes it pass is the cause.
   - If the reporter passes but a stressor profile fails: the added condition is the cause, and the failing profile is used from here on.
   - If nothing fails: quick mode stops ("not reproduced"); deep mode investigates either way, and only stops if the investigation does not reproduce it either.
4. **Deep investigation** (deep mode, the default; D-42). One Argon conversation (thinking high, thought summaries streamed to the page) opens with the report, the matrix, the file list, the whole git history, the application source and the full source of the vendored files the failing page loads, then loops over tool calls:
   - `read_file`, `search_code` (the whole repository, vendored code included), `git_log`, `git_show`;
   - `run_experiment`: up to six environment variants of the reporter's profile in one sandbox call, with optional replay steps and a probe expression measured in the page (a computed style, whether an API exists, DOM state); at most 12 experiments;
   - Google Search and URL context (built-in tools next to the functions);
   - `conclude`: the variant that reproduces the bug, the root cause, the file, the explanation and the evidence, or what is missing.

   Limits: 36 rounds, 32 minutes, and it stops exploring early enough to leave token budget for the fix. If the reproducing environment or steps are new, the matrix runs again (round 2) with them; steps are adopted only from a variant that failed, and they replace the replay plan.
5. **What belongs to this issue.** A profile is *required* if it passed in round 1, is the failing profile, or failed with the same signature (same failed step, same first console error, with engine-specific error wording normalised). Profiles that failed differently are **other problems** (probably other bugs): reported on the timeline, the run page and the PR text, and the model is told not to fix them.
6. **Memory.** `recallSimilar`: hybrid search (`$rankFusion`: Automated Embedding vector search plus lexical search, outcome-weighted) over verified past fixes of other issues, semantic score at least 0.82. Hits go on the timeline ("Seen something similar before") and into the prompt as hints.
7. **Proposal.** Argon (thinking high) returns the root cause (file and explanation), a pull request title, a Playwright test and a candidate fix (changed files with full contents). In deep mode it continues the investigation's own conversation, so the framework source and every experiment are still in context; if that continuation fails, it starts fresh with the conclusion in the prompt. The test has two cases: the failing profile (must fail before the fix) and a default-profile control (must pass). Environment conditions reach the test through the same `conditionHook` the matrix uses.
8. **Why this happens** (in parallel with verification, D-39). Argon with Google Search, code execution and URL context explains the platform rule behind the bug, with sources and a computed proof. It can only add to the result: a failure or a slow answer is ignored.
9. **Verification** (`verify.ts`, one sandbox call): reset the clone, add the test and run it (must be red: 1 failed, 1 passed), apply the fix, run all tests (must be green), re-run the matrix, print the diff. Files are staged under a unique directory and copied into place in that order.
10. **Retry.** If the test is not red, the tests fail, or a required profile still fails, only the verification output goes back to Argon inside the same conversation (`previous_interaction_id`), up to `LIMITS.maxFixAttempts` (3).
11. **Stop at approval.** The run ends at `approval_requested`. The developer reviews the root cause, why it happens, the diff, the test, what could not be emulated and similar past fixes.
12. **Memory and PR.** On finish, a verified fix is stored in `bug_memory`. Only after the developer clicks Approve does the web app create a branch, commit the fix and the test, and open the pull request (`Fixes #N`, root cause, why it happens with sources, how it was reproduced, the matrix, other problems seen, a short summary written by `gemini-3.8-flash`). Afterwards the pull request is followed (reviews, merged, closed), and "Address review feedback" revises the fix in the original conversation, verified like the first fix and pushed only on another click (D-31, D-33).

## Stop conditions

Each of these ends in a report to the developer, never a silent failure or a guess:
- Not reproduced under the reporter's profile, any extra condition or any experiment (with the details that would help, and a reply to the reporter that can be drafted and posted).
- A valid failing test could not be produced.
- The fix attempts are exhausted.
- The token budget is reached.
- The developer pressed Stop (the run ends after the step it is in).
- The billing cap is reached (`SpendingCapError`, no retry).
- The sandbox or API is unavailable after retries.

## Events

Every step writes a `run_events` document (`seq`, `atMs`, type, summary, optional data, tokens so far), redacted and size-capped. Types: `understood`, `profile`, `boot`, `hypothesis`, `matrix`, `deep_step`, `experiment`, `concluded`, `memory`, `root_cause`, `test_written`, `fix_attempt`, `green`, `explained`, `approval_requested`, `pr_opened`, `pr_update`, `revision`, `stopped`. The run page reads them in order through a change stream; the first `profile` event also writes the `tickets` document that the stream processor counts.

## Cost and latency

- **Quick mode** (measured 24 October on the first bug set): 3 to 6 minutes and 70k to 110k tokens per investigation.
- **Deep mode** (measured 25 October on the five demo bugs, three runs at once): 13 to 26 minutes, 235k to 2.2M new tokens, largest context 19k to 326k tokens (the React bug holds react-dom's source). See the table in STATUS.md.
- Sandbox calls take most of the time: on 24 October a matrix took about 40 s and a verification about 100 s; on 25 October even a no-op call took 20 to 50 s, and an environment reset under load added one to two minutes for the repair.
- Caps: `LIMITS` in `src/lib/config.ts` (600k tokens for a quick run, 6M new tokens for a deep one) and the constants at the top of `deep.ts`. Per user: 3 running investigations, 12 per hour.
