# Submission drafts

Drafts for the platform form (deadline Sunday 25 October 2026, 12:00 London). Edit freely. Anything in **[brackets]** depends on something that must be true or finished before submitting; check it, then remove the brackets or the sentence.

Repository: https://github.com/boranfurkan/reproducer-hackathon (demo target: https://github.com/boranfurkan/reproducer-hackathon-demo)
Demo video: **[link]**

## Project description (all challenges)

**ReProducer** turns "I cannot reproduce this bug" into a verified fix, for the bugs a coding assistant cannot find by reading the code: the ones that only happen to some users because of something they have. A client reports a bug that only happens on their device, in their language or in their timezone. ReProducer reads the GitHub issue and what the developer knows about the reporter (a sentence like "customer in Munich, Chrome on Windows, German", and optionally their screen recording), rebuilds that person's environment, runs the same steps under the reporter's profile, a neutral baseline, one-variable variations and conditions the report never mentioned, investigates in depth with Argon, and isolates the one thing that only they have. It then writes a failing Playwright test, fixes the code until the test passes and the rest of the suite stays green, and asks the developer before it opens a pull request.

The user is a developer who gets tickets they cannot reproduce on their own machine, where making the bug happen takes longer than fixing it.

What makes it different from a coding agent that reads the code: the demo bugs are invisible in the code. A page that goes white only when Chrome translates it for German customers (React 18 and the browser's `<font>` rewriting), a drawer that never closes for people who asked their Mac for less motion (an accessibility commit made `transitionend` never fire), a pay button that dies under a content blocker, a session that disappears on the night the UK clocks go back, a page that is blank on an iPhone that was never updated past iOS 14. ReProducer finds them by rebuilding the environment and experimenting:
- It reconstructs the **environment** (engine, viewport, pixel ratio, touch, locale, timezone, blocked storage), using a device catalog in MongoDB and the reporter's recording.
- It tests conditions the report **never mentioned**: page translation, content blockers, reduced motion, older engines without newer APIs, daylight-saving transitions, blocked storage, slow networks. A ticket that says "customers from Germany" becomes an experiment with the page translated.
- **Deep investigation**: Argon 4 works the bug for up to half an hour with the application, its whole git history and the full source of the framework the failing page uses in one context (react-dom alone is about 280k tokens), reading and searching code, reading commits, searching the web, and running experiments in real browsers with probes that measure the page (computed styles, whether an API exists). Every step is on the timeline.
- The pass/fail signal is real: a test that must fail on the reporter's profile before the fix and pass after it, plus a full matrix of environments.
- It **remembers** verified fixes and recalls similar ones before the next investigation.
- It states what it could not reproduce (real GPU, vendor browser build, real network) and stops to ask when it cannot reproduce or cannot verify.

## Google DeepMind: Build with Gemini 4 Argon

Models and agents used, and how:
- **gemini-4-argon, deep investigation**: one conversation with up to a million tokens of context (app, history, framework source), thinking high, and a tool loop: function calling (read and search files, git log and commits, experiments in the sandbox with probes, conclude) combined with the built-in Google Search and URL context. The fix proposal continues the same conversation, so it writes the test and the fix with everything it learned still in context.
- **gemini-4-argon** (Interactions API): reads the issue, the developer's notes and the reporter's screen recording; builds the environment profile; proposes extra conditions to test; writes the replay plan; finds the root cause from the whole repository (long context); writes the failing test and the fix (thinking level high, JSON-schema output). Retried with feedback if verification fails.
- **Antigravity managed agent (antigravity-preview-09-2026, running on Argon)**: the sandbox. A Linux environment where the repository is cloned and installed and Playwright (Chromium and WebKit) runs the replay matrix and the tests. Verification (red test, apply the fix, green tests, full matrix, diff) is a single sandbox call, so the verification loop is real test output, not the model's opinion.
- **Streaming and thought summaries**: every Argon call streams; the reasoning appears live on the run page.
- **Conversation state** (`previous_interaction_id`): fix retries and revisions of the pull request continue the model's own interaction, so it keeps its reasoning and the long repository prompt is cached.
- **Built-in tools together** (Google Search grounding, code execution, URL context): after the root cause, Argon explains the underlying platform rule, cites the specification and proves it with code it runs; the sources go into the pull request.
- **Function calling**: "Ask the memory" lets the model call read-only functions over MongoDB (hybrid search, grouped counts, the user's runs) to answer questions about past bugs.
- **Video understanding with timestamps**: key moments of the customer's recording with their times.
- **gemini-3.8-flash**: writes the pull request summary, triages the issue list (structured output), drafts the reply to a reporter when a bug cannot be reproduced.
- **Gemini Files API**: carries screen recordings and screenshots; Argon read a 150 KB phone recording in 8 seconds for under 1,000 tokens and listed the exact steps and the environment clues.

Real verification loop: failing test on the reporter's environment before the change, passing after, existing tests green, all required environments pass. Human control: the pull request is only opened after the developer clicks Approve; nothing is pushed before that.

Measured on 25 October with deep investigation: all five demo bugs were reproduced, explained and fixed end to end, each with a test that fails before the fix and passes after it in Chromium and WebKit. Runs took 13 to 26 minutes (including sandbox resets the agent repaired on its own), 235k to 2.2M new tokens; the React bug was worked with a 326k-token context holding the app, its history and React's source.

## Agents That Ship

Tools: GitHub (issues, branch, commit, pull request), a Linux sandbox with Playwright, Gemini (Argon, Flash, Files API), MongoDB Atlas.

Steps: read the issue and the notes; rebuild the reporter's environment; replay under the reporter, a baseline, one-variable resets and model-proposed extra conditions; investigate in depth (read the code, the git history and the framework source, search the web, run experiments in real browsers) until it can name the environment that reproduces the bug and the evidence; write a failing test; fix; verify (test red then green, whole matrix); show root cause, why it happens, diff, test and a fidelity report; **wait for approval**; open the pull request; follow it and revise it after review.

Where a human approves: the pull request, a revision pushed to it after review, and any reply posted to a reporter (each its own click; nothing is written to GitHub before). The approval card shows the root cause, the diff, what could not be reproduced and similar past fixes. Rejecting records the decision and pushes nothing.

Reliability and errors: retries on model overload; a hard stop on a billing cap; token budget and attempt caps per run; the red/green check is mandatory (a test that does not fail before the fix is rejected and regenerated); a run that cannot reproduce or cannot verify ends with a report and a question, not a guess; corrupted file transfers into the sandbox are detected by checksum and retried; a sandbox environment that was reset between calls is set up again inside the same call; runs left unfinished by a restart are marked as interrupted; a Stop button ends a run after the step it is in. Record of what the agent did: every step is a timestamped event in MongoDB (`run_events`), secrets are redacted before storage, and approvals are stored with who and when.

Safety: user environment variables go only to the sandbox, are never stored or logged, and a run that has them never reuses a sandbox; per-user limits (3 running, 12 per hour); per-run caps on tokens, rounds, experiments and minutes; the session token is encrypted in an HttpOnly cookie and never reaches the browser.

## MongoDB Atlas

Atlas (M10) is the data store for everything the app knows. Features used and where:
- **Automated Embedding** (Voyage AI): `voyage-4` on the symptom text and `voyage-code-4` on the diff of each verified fix; no embedding code in the app.
- **Vector Search**: "which past bugs look like this one" and "which past fixes look like this diff".
- **Atlas Search** (lexical, with token fields and facets): full-text search over past bugs; facets on the dashboard (what isolated each bug, engine, locale); fuzzy search over a **device catalog** that turns "Samsng Galaxy Z Flip" or "windows pc 23 inch monitor with nvidia rtx3060" into a realistic environment.
- **Hybrid Search** (`$rankFusion`, semantic weight 0.7 and lexical 0.3): the "have we seen this before?" step that runs before the model proposes a fix. The hits appear on the timeline and in the prompt as hints.
- **Atlas Stream Processing**: a processor reads new tickets from a change stream and keeps one counter per repo, engine and locale with `$merge` and an update pipeline; three reports from one environment become a "possible shared bug" alert on the dashboard within seconds (run and verified on Atlas, workspace `reproducer`).
- **Change streams**: the run page is pushed live from the run, its timeline events and its pull request history; no polling while connected.
- **Transactions**: approving a pull request, every change to its state (review, merged, closed) and a revision are single multi-document transactions across `runs`, `approvals`, `pr_events`, `run_events` and `bug_memory`.
- **Memory that learns**: the outcome of the pull request is stored on the memory entry and weights recall (merged fixes rank higher, closed ones lower).
- **Aggregation pipelines**: `$group`, `$setWindowFields` (running totals), `$lookup`, `$dateTrunc` power the Insights page and the "Ask the memory" counts.
- **Schema validation** (`$jsonSchema`) on `runs`, `bug_memory`, `pr_events`, `approvals`; **TTL indexes** on `tickets` and `ticket_clusters`.
- **Vector search with a similarity score** (cosine, threshold measured on the data) powers the "looks like an issue we already fixed" badges on the issue list.
- Collections: `tickets`, `runs`, `run_events` (timeline and audit trail), `bug_memory`, `environments` (device catalog), `approvals`, `ticket_clusters`, `pr_events`.

The demo video shows MongoDB in use: the run page pushed live by a change stream, the dashboard's "what it has learned" facets, the Insights page (aggregations), an "Ask the memory" question (function calling over Atlas) and a shared-bug alert from Stream Processing.

## Short pitch (60 seconds)

"You get a ticket: 'the shop goes white when I empty my basket'. It works on your machine, and the code looks fine. A coding assistant reads it and finds nothing, because there is nothing wrong in the code. ReProducer takes the issue and one sentence, 'customer in Munich, Chrome, German', and investigates like a senior engineer: it loads the app, its history and the whole React source into Argon's context, and experiments in real browsers. German customer, English shop: Chrome translates the page. With translation on, the page goes white. It reads React's commit path, finds the text node the translator replaced, writes a test that fails with translation and passes without, fixes it, and proves it goes from red to green. You click approve, and only then does it open the pull request."
