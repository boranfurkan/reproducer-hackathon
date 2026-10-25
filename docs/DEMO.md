# Demo

Three minutes, recorded (a sped-up recording is acceptable), no slides in the video. The Gemini score is 50% working live demo, 25% problem and usefulness, 15% originality and need for Argon, 10% clarity.

## User

A developer whose customers report bugs that only happen to them, and whose code looks correct. A coding assistant that reads the code finds nothing, because the cause is something only those customers have.

## Before recording

- Start the app in tour mode: `npm run dev:demo` (http://localhost:3000); the development badge is hidden. Plain `npm run dev` has no tour.
- The tour is one sequence of 40 steps through the whole story. The card (bottom left) says "Step 12 of 40", highlights one element and shows a caption for the viewers. **→** or Enter goes on; on a step whose button says **Open** or **Go**, → clicks the highlighted thing for you (or click it yourself). **←** back, **Esc** hides the card, **T** shows it, **R** starts again from step 1 on the dashboard (press it before every take). The position survives a reload. `?tour=0` / `?tour=1` in the URL switch it off or on in that browser.
- Log in with GitHub. Browser window at least 1440 px wide, zoom 100%, bookmarks bar hidden, other tabs closed.
- Open the demo repository's issue list once, about a minute before recording: the triage badges come from a Gemini call that is slow right now (40 to 60 s) and are then cached for ten minutes.
- Ready in the app: a finished deep run of every issue #8 to #12 waiting at the approval card, the stopped #10 run and the #10 run that picked up its notes, Stream Processing running (shared-bug alerts on the dashboard).

## The recording, step by step

Numbers are the tour's steps. What to say is in quotes (read it from the phone). Optional steps are skipped by → when their element is not on the page.

### Dashboard (steps 1 to 7), about 35 s

1. **ReProducer.** "A customer writes: the shop goes white when I empty my basket. It works on my machine, the code looks fine, and a coding assistant finds nothing, because nothing in the code is wrong on its own. ReProducer finds bugs like that."
2. **Your repositories.** "I log in with GitHub and pick the repository with the bug reports."
3. **Investigations.** "Every investigation is here, live or finished. The finished ones wait for my approval: nothing is ever pushed without it."
4. **Possible shared bug.** "Atlas Stream Processing counts reports per environment, live. Several reports from one environment become a shared-bug alert."
5. **Ask the memory.** "I can ask the memory in plain words. Gemini answers by calling tools over MongoDB." (Optional: click the example *What isolates most bugs, and how many?* and Ask; the answer takes about 20 s, cut the wait.)
6. **What it has learned.** "And this is what the memory has learned from every verified fix: what isolated each bug."
7. **Open the demo shop** (→ opens it). "Our demo shop: five small apps in five stacks, React, Vue, plain JavaScript, Preact and Alpine."

### Issue list (steps 8 to 10), about 15 s

8. **The tickets.** "These are real GitHub issues, written the way customers write them."
9. **Triage.** "Gemini Flash has already read them and flags which ones look environment-specific."
10. **Issue #8** (→ opens it). "Let's take the hardest one: the shop turns white for some customers."

### Ticket form (steps 11 to 18), about 35 s

11. **The report.** "The customer's words, straight from GitHub. Three customers, all from Germany, and it works on our laptops."
12. **Who hit the bug?** "All I add is one sentence about the reporter."
13. **What we know** (→ fills it in). "Customer in Munich, Chrome on Windows, German is her language."
14. **Their recording.** "If the customer sent a screen recording, Gemini watches it for the steps and for clues about their device and language."
15. **Environment variables.** "If the app needs secrets to start, they go to the sandbox only and are never stored."
16. **Deep investigation.** "Deep mode: Gemini 4 Argon gets the whole app, its git history and the full source of the framework in one context, and runs its own experiments."
17. **Sandbox.** "The sandbox is an Antigravity managed agent on Argon: Linux with real Chromium and WebKit, already warmed up."
18. **Investigate** (→ starts the investigation). "Nothing reaches GitHub until I approve."

### The live run (steps 19 to 22), about 30 s, then CUT

19. **The investigation.** "It's running: status, time and tokens, live, pushed by a MongoDB change stream."
20. **Working live.** "This is Argon's thinking, streamed while it works."
21. **The timeline.** "Every step lands here as it happens: it read the report and rebuilt her environment from my sentence and the device catalog." Let two or three entries appear.
22. **Next: the finished run.** **CUT the recording here.** A deep run of #8 takes about 25 minutes. When you resume, press → (it goes to the dashboard).

### The finished run of #8 (steps 23 to 32), about 60 s

23. **The finished investigation** (→ opens it). "Here is the same issue, investigated earlier, fixed and verified."
24. **Fixed and verified.** "About 26 minutes from the report to a verified fix, and every step is on record."
25. **Replay matrix.** "First the same replay under many environments, in Chromium and WebKit: the reporter, a neutral baseline, one variable reset at a time, and conditions the report never mentioned. With the page translated, it goes white."
26. **A million-token context.** "Then the deep investigation: 326 thousand tokens in Argon's context, the app, its git history and React's own source."
27. **Experiments.** "Argon tests its ideas in real browsers and measures the page."
28. **The cause, with evidence.** "Chrome translates the page for German customers and replaces text nodes with font elements. When the basket empties, React removes a text node that is no longer there and the whole app unmounts. It found that in React's own commit path."
29. **Red, then green.** "It wrote a Playwright test that fails in her environment before the fix and passes after it, and the existing tests stay green."
30. **Why this happens.** "Gemini explains the browser rule behind it with Google Search and code execution, with sources."
31. **You approve.** "The root cause, the diff and the test. Only this click opens a pull request." (Clicking **Approve and open pull request** creates a real branch and pull request on the demo repository; do it only if you want that in the video.)
32. **Next: a run that stopped** (→ goes to the dashboard). "What happens when an investigation doesn't finish?"

### Notes between runs (steps 33 to 37), about 25 s

33. **A stopped run** (→ opens it). "This run of issue 10 was stopped halfway, on purpose."
34. **Notes for the next run.** "Even stopped, it saved what it tried in MongoDB: the environments, what it read, its best explanation."
35. **Next: the run after it** (→ goes to the dashboard).
36. **The next run** (→ opens it). "The next run of the same issue."
37. **Notes from earlier runs.** "It started from those notes and didn't repeat the experiment: 5 minutes instead of 14."

### Insights and close (steps 38 to 40), about 20 s

38. **Insights** (→ opens it). "Finally, what it did and what it cost."
39. **Insights.** "MongoDB aggregation pipelines over every run: time, tokens and outcomes."
40. **ReProducer.** "ReProducer rebuilds the customer's world, investigates with Argon's full context, proves the fix in real browsers, and ships only when you approve. Bugs you cannot reproduce, reproduced."

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
