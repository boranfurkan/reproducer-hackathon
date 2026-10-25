# Demo

Three minutes, recorded (a sped-up recording is acceptable), no slides in the video. The Gemini score is 50% working live demo, 25% problem and usefulness, 15% originality and need for Argon, 10% clarity.

## User

A developer whose customers report bugs that only happen to them, and whose code looks correct. A coding assistant that reads the code finds nothing, because the cause is something only those customers have.

## Before recording

- Start the app in tour mode: `npm run dev:demo` (http://localhost:3000). The tour card appears bottom left on every page and highlights one feature at a time; the development badge is hidden. Keys: **→** or Enter next, **←** back, **Esc** hides the card, **T** shows it again. `?tour=0` in the URL turns it off in that browser, `?tour=1` back on. Plain `npm run dev` has no tour.
- Log in with GitHub. Browser window at least 1440 px wide, zoom 100%, bookmarks bar hidden, other tabs closed.
- Open the demo repository's issue list once, about a minute before recording: the triage badges come from a Gemini call that is slow right now (40 to 60 s) and are then cached for ten minutes.
- Ready in the app: a finished deep run of every issue #8 to #12 waiting at the approval card, the stopped #10 run and the #10 run that picked up its notes, Stream Processing running (shared-bug alerts on the dashboard).

## The recording, scene by scene

The tour step numbers below match the card ("3 / 6"). Each scene says what to click, which tour steps to show, and what to say (read it from the phone).

### 1. Dashboard (tour 1 to 3), about 20 s

- **1 · ReProducer.** "A customer writes: the shop goes white when I empty my basket. It works on my machine, the code looks fine, and a coding assistant finds nothing, because nothing in the code is wrong on its own. ReProducer finds bugs like that."
- **2 · Your repositories.** "I log in with GitHub and pick the repository with the bug reports."
- **3 · Investigations.** "Every investigation is here, live or finished. The finished ones are waiting for my approval: nothing is ever pushed without it."
- Click `boranfurkan/reproducer-hackathon-demo`.

### 2. Issue list (tour 1 and 2), about 15 s

- **1 · The tickets.** "These are real GitHub issues from our demo shop: five apps in five stacks, React, Vue, plain JavaScript, Preact and Alpine."
- **2 · Triage.** "Gemini Flash has already read them and flags which ones look environment-specific."
- Click **#8** "Shop turns completely white…".

### 3. Ticket form for #8 (tour 1 to 5), about 25 s

- **1 · Who hit the bug?** Click the **#8 Munich, Chrome, German** button. "All I add is one sentence about the reporter: customer in Munich, Chrome on Windows, German is her language."
- **2 · Their recording.** "If the customer sent a screen recording, Gemini watches it for the steps and for clues about their device and language."
- **3 · Deep investigation.** "Deep mode: Gemini 4 Argon gets the whole app, its git history and the full source of the framework in one context, and runs its own experiments."
- **4 · Sandbox.** "The sandbox is an Antigravity managed agent on Argon: Linux with real Chromium and WebKit, already warmed up."
- **5 · Investigate.** "Nothing reaches GitHub until I approve." Click **Investigate**.

### 4. The live run, first 30 to 40 s (tour 1 and 2), then CUT

- **1 · The investigation.** "It's running now: status, time and tokens, live, pushed by a MongoDB change stream."
- **2 · Working live.** "This is Argon's thinking, streamed while it works." Let the first entries appear: *Read the report*, *Rebuilt the environment* (from the notes and the device catalog in MongoDB), the replay plan.
- **CUT the recording here.** A deep run of #8 takes about 25 minutes.
- To continue: open the finished #8 run (dashboard, "reproducer-hackathon-demo#8", Waiting for you) — the same issue, investigated the same way overnight. If you prefer to wait for the live run itself, it is the newest #8 run on the dashboard; #9 (about 13 minutes) is the quickest issue to wait for.

### 5. The finished #8 run (tour steps of the run page), about 50 s

Press → through the steps; steps that a run does not have are skipped.

- **The investigation.** "Here's the result: about 26 minutes, verified."
- **Replay matrix.** "First the same replay under many environments, in Chromium and WebKit: the reporter, a neutral baseline, one variable reset at a time, and conditions the report never mentioned. With the page translated, it goes white."
- **A million-token context.** "Then the deep investigation: 326 thousand tokens in Argon's context, the app, its git history and React's own source."
- **Experiments.** "Argon tests its ideas in real browsers and measures the page."
- **The cause, with evidence.** "Chrome translates the page for German customers and replaces text nodes with font elements. When the basket empties, React removes a text node that is no longer there and the whole app unmounts. It found that in React's commit path."
- **Red, then green.** "It wrote a Playwright test that fails in her environment before the fix and passes after it, and the existing tests stay green."
- **Why this happens.** "Gemini explains the browser rule behind it with Google Search and code execution, with sources."
- **You approve.** "The root cause, the diff and the test. Only this click opens a pull request." (Clicking **Approve and open pull request** creates a real branch and pull request on the demo repository; do it only if you want that in the video.)

### 6. It picks up where it stopped, about 20 s

- Dashboard → the #10 run marked **Stopped**. Tour: **Notes for the next run.** "This run was stopped halfway. It still left notes in MongoDB: what it tried, what it read, its best explanation."
- Dashboard → the #10 run after it (the newer one, Waiting for you). Tour: **Notes from earlier runs.** "The next run of the same issue started from those notes and didn't repeat the experiment: 5 minutes instead of 14."

### 7. MongoDB, about 25 s

- Header → **Insights**. Tour: **Insights.** "Insights are MongoDB aggregation pipelines over every run: time, tokens and outcomes."
- Back to the dashboard, press → to step **4 · Possible shared bug.** "Atlas Stream Processing counts reports per environment, live; several from one environment become a shared-bug alert."
- **5 · Ask the memory.** Click the example **What isolates most bugs, and how many?** and press Ask (the answer takes about 20 s; cut the wait). "Gemini answers by calling tools over MongoDB, grouped counts, my runs and hybrid search, and shows which ones it used: five verified fixes, each isolated by a different condition."
- **6 · What it has learned.** "And this is what the memory has learned from every verified fix."

### 8. Close, about 10 s

"ReProducer: it rebuilds the customer's world, investigates with Argon's full context, proves the fix in real browsers, and ships only when you approve. Bugs you cannot reproduce, reproduced."

## If something goes wrong while recording

- The live run is slow or fails: cut to the finished run; it is the same issue.
- The triage badges are not there yet: wait on the issue list, or skip tour step 2 there.
- The approval fails (GitHub): the finished run stays waiting; show the card only.
- Do not show `.env.local` or terminal output with tokens.

## Avoid (from the challenge briefs)

- A static page with no verification loop.
- A chat wrapper.
- Any medical, mental-health or financial advice features.
- Code written before kickoff.
