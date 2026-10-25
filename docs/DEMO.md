# Demo

Three minutes, recorded (a sped-up recording is acceptable), no slides. The Gemini score is 50% working live demo, 25% problem and usefulness, 15% originality and need for Argon, 10% clarity.

## User

A developer whose customers report bugs that only happen to them, and whose code looks correct. A coding assistant that reads the code finds nothing, because the cause is something only those customers have.

## What is ready (prepared overnight on 25 October)

- The demo repository has five open issues, #8 to #12, each a different stack and a different kind of hidden cause (`docs/DEMO-BUGS.md`).
- Each issue has a finished **deep investigation** in the app, waiting at the approval card (dashboard, "Recent investigations"). Nothing was approved: no pull request was opened.
- Stream Processing is running on Atlas, so new investigations count toward shared-bug alerts.
- `npm run demo:cluster` adds a shared-bug alert in seconds if you want one on screen (`-- --clean` removes it).

## Recording (about 3 minutes after speeding up)

Start the app with `npm run dev`, log in with GitHub, open http://localhost:3000.

| Part | What to show |
|---|---|
| 0:00 | The problem in one sentence: bugs that only some customers have, invisible in the code. |
| 0:15 | The issue list of the demo repo: triage badges mark the issues as environment-specific. |
| 0:25 | Open #8 ("Shop turns completely white..."). Type the notes: *Customer in Munich, Chrome on Windows 11, German is her language.* Keep "Deep investigation" selected, click Investigate. Show 20 to 30 seconds live: the thinking line, the first matrix, the context counter once the deep investigation opens (over 300k tokens: React's source is in Argon's context). |
| 1:00 | Switch to the finished #8 run from the dashboard. Scroll the timeline: the investigation opens with the app, its history and the React source; Argon reads the storefront commit; the experiment with the page translated reproduces it; the conclusion and its evidence; the test fails before the fix and passes after; the matrix after the fix; "Why this happens" with sources. |
| 1:45 | Click **Approve and open pull request** on #8. The pull request opens on GitHub (this is real: it creates a branch and a PR on the demo repo). |
| 2:00 | Flick through the other four finished runs, showing only each conclusion card: #9 (reduced motion; it found the accessibility commit), #10 (content blocker), #11 (the night the UK clocks go back), #12 (old iPhone without newer APIs). |
| 2:15 | Picking up where it stopped: open the stopped #10 run and scroll to its last entry, "Notes for the next run" (saved in MongoDB). Then open the #10 run after it: its timeline opens with "Notes from earlier runs", and it goes from the matrix to the commit and the conclusion without repeating the experiment. |
| 2:25 | MongoDB: Insights (aggregations), one "Ask the memory" question (function calling over Atlas), the shared-bug alert from Stream Processing. |
| 2:45 | Close: Argon 4 with a million tokens of context, experimenting in real browsers, and a human approving before anything is pushed. |

A deep run took 13 to 26 minutes on the five demo bugs, so record the live start and cut to the finished run. Notes:
- The live run appears on the dashboard next to the finished one for the same issue. Once you have what you need on screen, press **Stop** on it (it ends after the step it is in and saves tokens), or let it finish.
- Run one live investigation at a time: with three at once the sandbox reset its environments and each repair cost one to two minutes.
- The shared-bug alerts count tickets per environment. All tickets so far came from your account, so each alert shows one reporter. `npm run demo:cluster` adds three tickets from three demo reporters if you want an alert with several people on it (`-- --clean` removes them).

## If something goes wrong while recording

- The live run is slow or fails: cut to the finished run; it is the same issue.
- The approval fails (GitHub): the finished run stays waiting; try again or show the card only.
- Do not show `.env.local` or terminal output with tokens.

## Avoid (from the challenge briefs)

- A static page with no verification loop.
- A chat wrapper.
- Any medical, mental-health or financial advice features.
- Code written before kickoff.
