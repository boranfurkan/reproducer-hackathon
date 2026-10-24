# Submission drafts

Drafts for the platform form (deadline Sunday 25 October 2026, 12:00 London). Edit freely. Anything in **[brackets]** depends on something that must be true or finished before submitting; check it, then remove the brackets or the sentence.

Repository: https://github.com/boranfurkan/reproducer-hackathon (demo target: https://github.com/boranfurkan/reproducer-hackathon-demo)
Demo video: **[link]**

## Project description (all challenges)

**ReProducer** turns "I cannot reproduce this bug" into a verified fix. A client reports a bug that only happens on their device, in their language or in their timezone. ReProducer reads the GitHub issue and what the developer knows about the reporter (a sentence like "Samsung Z Flip, Chrome, Turkish", and optionally their screen recording), rebuilds that person's environment, runs the same steps under the reporter's profile, a neutral baseline, and one-variable variations, and isolates the one thing that only they have. It then writes a failing Playwright test, fixes the code until the test passes and the rest of the suite stays green, and asks the developer before it opens a pull request.

The user is a developer who gets tickets they cannot reproduce on their own machine, where making the bug happen takes longer than fixing it.

What makes it different from a coding agent that "tries things":
- It reconstructs the **environment** (engine, viewport, pixel ratio, touch, locale, timezone, blocked storage), using a device catalog in MongoDB and the reporter's recording.
- It tests conditions the report **never mentioned**. One of the demo bugs (a blank page) only appears with blocked storage, and the ticket says only "opened from Instagram": the reporter's own profile passes, an extra condition proposed by the model reproduces it.
- The pass/fail signal is real: a test that must fail on the reporter's profile before the fix and pass after it, plus a full matrix of environments.
- It **remembers** verified fixes and recalls similar ones before the next investigation.
- It states what it could not reproduce (real GPU, vendor browser build, real network) and stops to ask when it cannot reproduce or cannot verify.

## Google DeepMind: Build with Gemini 4 Argon

Models and agents used, and how:
- **gemini-4-argon** (Interactions API): reads the issue, the developer's notes and the reporter's screen recording; builds the environment profile; proposes extra conditions to test; writes the replay plan; finds the root cause from the whole repository (long context); writes the failing test and the fix (thinking level high, JSON-schema output). Retried with feedback if verification fails.
- **Antigravity managed agent (antigravity-preview-09-2026)**: the sandbox. A Linux environment where the repository is cloned and installed and Playwright (Chromium and WebKit) runs the replay matrix and the tests. Verification (red test, apply the fix, green tests, full matrix, diff) is a single sandbox call, so the verification loop is real test output, not the model's opinion.
- **gemini-3.8-flash**: writes the pull request summary.
- **Gemini Files API**: carries screen recordings and screenshots; Argon read a 150 KB phone recording in 8 seconds for under 1,000 tokens and listed the exact steps and the environment clues.

Real verification loop: failing test on the reporter's environment before the change, passing after, existing tests green, all required environments pass. Human control: the pull request is only opened after the developer clicks Approve; nothing is pushed before that.

Measured on 24 October: all four demo bugs were fixed end to end by the agent on the first attempt, in about 4 to 5 minutes (a cold sandbox adds about 2), 77k to 95k tokens each, in 11 of 11 runs made with the final rules; the inputs tried were text only, a screen recording and a screenshot.

## Agents That Ship

Tools: GitHub (issues, branch, commit, pull request), a Linux sandbox with Playwright, Gemini (Argon, Flash, Files API), MongoDB Atlas.

Steps: read the issue and the notes; rebuild the reporter's environment; replay under the reporter, a baseline, one-variable resets and model-proposed extra conditions; isolate the cause; write a failing test; fix; verify (test red then green, whole matrix); show root cause, diff, test and a fidelity report; **wait for approval**; open the pull request.

Where a human approves: the pull request. The approval card shows the root cause, the diff, what could not be reproduced and similar past fixes. Rejecting records the decision and pushes nothing.

Reliability and errors: retries on model overload; a hard stop on a billing cap; token budget and attempt caps per run; the red/green check is mandatory (a test that does not fail before the fix is rejected and regenerated); a run that cannot reproduce or cannot verify ends with a report and a question, not a guess; corrupted file transfers into the sandbox are detected by checksum and retried; runs left unfinished by a restart are marked as interrupted. Record of what the agent did: every step is a timestamped event in MongoDB (`run_events`), secrets are redacted before storage, and approvals are stored with who and when.

Safety: user environment variables go only to the sandbox, are never stored or logged, and a run that has them never reuses a sandbox; per-user limits (2 running, 12 per hour); the session token is encrypted in an HttpOnly cookie and never reaches the browser.

## MongoDB Atlas

Atlas (M10) is the data store for everything the app knows. Features used and where:
- **Automated Embedding** (Voyage AI): `voyage-4` on the symptom text and `voyage-code-4` on the diff of each verified fix; no embedding code in the app.
- **Vector Search**: "which past bugs look like this one" and "which past fixes look like this diff".
- **Atlas Search** (lexical, with token fields and facets): full-text search over past bugs; facets on the dashboard (what isolated each bug, engine, locale); fuzzy search over a **device catalog** that turns "Samsng Galaxy Z Flip" or "windows pc 23 inch monitor with nvidia rtx3060" into a realistic environment.
- **Hybrid Search** (`$rankFusion`, semantic weight 0.7 and lexical 0.3): the "have we seen this before?" step that runs before the model proposes a fix. The hits appear on the timeline and in the prompt as hints.
- **Atlas Stream Processing** **[only if the processor was started]**: a change stream on new tickets, a hopping window and `$merge` flag several reports from the same environment as one probable bug.
- Collections: `tickets`, `runs`, `run_events` (timeline and audit trail), `bug_memory`, `environments` (device catalog), `approvals`, `ticket_clusters`.

The demo video shows MongoDB in use: **[the memory hit on the timeline, the dashboard facets, the stored events]**.

## Short pitch (60 seconds)

"You get a ticket: 'the page is blank for some customers'. It works on your machine. You lose a day just making it happen. ReProducer takes the issue and one sentence about the customer, 'iPhone, opened from Instagram', rebuilds that environment, and tries things you did not think to try. Here the reporter's profile passes. It adds one condition, blocked storage, and the page goes white. It finds the module that reads localStorage on load, writes a failing test, fixes it, proves the test goes from red to green, and shows you the diff. You click approve, and only then does it open the pull request. And the next time a bug looks like this one, it remembers."
