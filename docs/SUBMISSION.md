# Submission

Final texts for the submission form (Encode London Hackathon 2026, deadline Sunday 25 October, 12:00 London).

- Repository: https://github.com/boranfurkan/reproducer-hackathon
- Demo target repository (the shop with the bugs and the GitHub issues): https://github.com/boranfurkan/reproducer-hackathon-demo
- Demo video: **[link]**

Challenges entered: Build with Gemini 4 Argon (Google DeepMind), Build Anything with MongoDB Atlas (MongoDB), Agents That Ship. Not entered: Saint (ReProducer does not use Saint) and The Real World.

## 1. Project description

ReProducer is an AI agent for the bug reports nobody can reproduce. A customer writes "the shop goes white when I empty my basket"; it works on your machine, the code looks fine, and a coding assistant that reads the code finds nothing, because the bug only exists where the code meets something that customer has: the browser translating the page, a content blocker, reduced motion, a timezone on the night the clocks change, an old iPhone. ReProducer takes the GitHub issue plus one sentence about the reporter ("customer in Munich, Chrome, German"), rebuilds that person's environment in a sandbox with real browsers, investigates in depth with Gemini 4 Argon (the app, its git history and the framework's full source in one context, plus its own browser experiments), writes a test that fails in the reporter's environment, fixes the code until the test passes, and asks the developer before it opens a pull request. It found and fixed all five demo bugs, each invisible in the code, end to end.

## 2. Challenges and bounties

### Build with Gemini 4 Argon (Google DeepMind), Pathway 1: Autonomous Agents That Ship

ReProducer is an agent that plans, uses tools and verifies its own work against a concrete pass/fail signal from real browsers.

Models and agents:
- **gemini-4-argon**: the brain. It reads the issue, the developer's notes and the reporter's screen recording; rebuilds the environment; proposes conditions the report never mentioned; writes the replay plan; runs the deep investigation; writes the failing test and the fix; explains the platform rule behind the bug; revises the pull request after review.
- **Antigravity managed agent (antigravity-preview-09-2026), running on Argon**: the sandbox. A Linux environment where the repository is cloned and Playwright replays every scenario in Chromium and WebKit, runs the tests and verifies the fix.
- **gemini-3.8-flash**: the quick jobs: triage of the issue list, pull request summaries, drafted replies to reporters, and "Ask the memory".

Gemini features used:
- **1M-token context**: the deep investigation holds the application, its whole git history and the full source of the framework files the failing page loads; on the React bug that was a 326k-token context (react-dom alone is about 280k tokens).
- **Function calling combined with built-in tools**: one tool loop with ReProducer's functions (read and search files, git log and commits, run an experiment in the sandbox with up to six environment variants and a probe measured in the page, conclude) and Google's Google Search and URL context.
- **Conversation state** (`previous_interaction_id`): the fix, its retries and later pull request revisions continue the investigation's own conversation, so the fix is written with everything it learned still in context.
- **Thinking levels and streamed thought summaries**: Argon's reasoning appears live on the run page.
- **Built-in tools together** (Google Search grounding, code execution, URL context): "Why this happens" explains the browser or framework rule behind each bug, with sources and a computed proof, and it goes into the pull request.
- **Structured output** (JSON schemas) for every step the app parses.
- **Video understanding** through the Files API: a customer's recording becomes steps, environment clues and timestamped key moments.

The verification loop is real: a Playwright test must fail in the reporter's environment before the fix and pass after it, the existing tests must stay green, and the environment matrix must pass in both engines. People stay in control: nothing is written to GitHub until the developer clicks Approve. Measured on 25 October: all five demo bugs reproduced, explained and fixed, each in 13 to 26 minutes.

### Build Anything, Change Everything with MongoDB Atlas

MongoDB Atlas (M10) is the data store for everything ReProducer knows. All six listed features have a real job:
- **Automated Embedding**: every verified fix is embedded by Atlas itself, `voyage-4` on the symptom text and `voyage-code-4` on the diff; there is no embedding code in the app.
- **Atlas Vector Search**: "similar past fixes" on the approval card, and the "looks like an issue already fixed" badges on the issue list (cosine thresholds measured on the data).
- **Hybrid Search** (`$rankFusion` of vector and lexical search): "have we seen this before?" before every fix proposal; fixes whose pull request was merged rank higher.
- **Atlas Search**: fuzzy search over a device catalog, so "iPhone 8 she never updated" or "Samsng Galaxy Z Flip" becomes a realistic environment; `$searchMeta` facets for the dashboard's "What it has learned".
- **Atlas Stream Processing**: a running processor reads new tickets from a change stream and keeps a counter per repository, browser engine and locale with `$merge`; several reports from one environment become a "possible shared bug" alert on the dashboard.
- **Voyage AI models**: `voyage-4` and `voyage-code-4`, through Automated Embedding.

Also used: **change streams** push the run page live; **multi-document transactions** keep the run, the approval, the pull request history and the memory consistent; **schema validation** (`$jsonSchema`) on the main collections; **TTL indexes** on short-lived data; **aggregation pipelines** (`$setWindowFields`, `$lookup`, `$group`, `$dateTrunc`) for the Insights page and for "Ask the memory", where Gemini calls tools over MongoDB; and **notes between runs**: an investigation that does not finish stores what it tried in `issue_notes`, and the next run of that issue starts from it (on issue #10: 5 minutes instead of 14).

### Agents That Ship

ReProducer does a developer's real job end to end: take an issue that only some customers hit, find out why, write the fix, run the tests and open a pull request ready for review.

- **Tools**: GitHub (issues, files, git history, branch, commit, pull request, reviews, comments), a Linux sandbox with Playwright, Chromium and WebKit, Gemini (Argon, Flash, Files API, Google Search, URL context, code execution), MongoDB Atlas.
- **Steps**: read the issue and the notes → rebuild the reporter's environment → replay under the reporter, a baseline, one-variable resets and conditions the report never mentioned → investigate in depth (code, history, framework source, web, experiments in real browsers) → write a failing test → fix → verify (red then green, existing tests, every environment) → show the root cause, why it happens, the diff, the test and what could not be emulated → **wait for approval** → open the pull request → follow it, and revise it after review.
- **Where a human approves**: the pull request, a revision pushed after review, and any reply posted to a reporter are each a separate click; nothing is written to GitHub before.
- **Reliability**: retries on model overload; a hard stop on a billing cap; caps on tokens, rounds, experiments and minutes; a sandbox environment that was reset between calls is repaired inside the same call; a test that does not fail before the fix is rejected and rewritten; a run that cannot reproduce ends with a report and a drafted question for the reporter, not a guess; a run that stops leaves notes so the next attempt does not start from zero; a Stop button.
- **Record and safety**: every step is a timestamped event in MongoDB, secrets are redacted before storage, approvals are stored with who and when; user environment variables go only to the sandbox and are never stored; the GitHub token never reaches the browser or the sandbox.

## 3. Submission details

**What I built.** The idea came from a friend, Oguz, a freelance developer whose most-repeated sentence to clients is "I can't reproduce this bug". The customer swears it's broken, it works on every machine Oguz tries, and hours go into making the bug happen at all before any fixing can start. I built ReProducer around that feedback: a web app and AI agent that takes the client's bug report and turns "I can't reproduce it" into a verified fix waiting for approval. Built solo during the hackathon with Next.js, Gemini (Argon, the Antigravity managed agent, Flash) and MongoDB Atlas, plus a demo shop with five apps in five stacks (React, Vue, plain JavaScript, Preact, Alpine.js) and five real bugs of this kind.

**The problem.** The hardest bug tickets are the ones that only happen to some customers. The code looks correct, it works on every developer's machine, and a coding assistant that reads the code finds nothing, because the cause is something only those customers have: page translation, a content blocker, an accessibility setting, a timezone, an old browser. Developers lose hours or days making the bug happen at all, before they can fix it.

**How it works.** The developer picks a GitHub issue and adds one sentence about the reporter, optionally their screen recording. Argon turns that into a concrete environment (engine, device, locale, timezone, and conditions like page translation or removed browser APIs), matched against a device catalog in MongoDB. The Antigravity sandbox replays the issue under the reporter's environment, a neutral baseline, one-variable resets and conditions the report never mentioned, in Chromium and WebKit. Then the deep investigation: one Argon conversation with the app, its git history and the framework's full source in context reads files and commits, searches the web, and runs its own experiments in real browsers until it can show the environment that reproduces the bug and the mechanism behind it. In the same conversation it writes a Playwright test and a fix; the sandbox checks that the test fails before the fix and passes after it, that the existing tests pass and that every environment is green, and feeds failures back for another attempt. The developer reviews the root cause, "why this happens" with sources, the diff and the test, and only their click opens the pull request. Everything is recorded in MongoDB, verified fixes become searchable memory, and an unfinished run leaves notes for the next one. Measured on 25 October: all five demo bugs fixed and verified, 13 to 26 minutes each.

**What's next.** Run it as a hosted service and a GitHub App that picks up new issues by itself; support private repositories with scoped credentials in the sandbox; add more environments (Firefox, real mobile devices, network and CPU profiles) and more kinds of projects beyond JavaScript web apps; read the reporter's details straight from support tools such as Zendesk or Intercom; share the memory across a team's repositories, so a fix found once helps everywhere.

## Short pitch (60 seconds)

"You get a ticket: 'the shop goes white when I empty my basket'. It works on your machine, and the code looks fine. A coding assistant reads it and finds nothing, because there is nothing wrong in the code. ReProducer takes the issue and one sentence, 'customer in Munich, Chrome, German', and investigates like a senior engineer: it loads the app, its history and the whole React source into Argon's context, and experiments in real browsers. German customer, English shop: Chrome translates the page. With translation on, the page goes white. It reads React's commit path, finds the text node the translator replaced, writes a test that fails with translation and passes without, fixes it, and proves it goes from red to green. You click approve, and only then does it open the pull request."
