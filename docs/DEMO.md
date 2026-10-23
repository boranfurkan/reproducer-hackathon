# Demo

Three minutes, live, no slides. The Gemini score is 50% working live demo, 25% problem and usefulness, 15% originality and need for Argon, 10% clarity.

## User

A developer who gets a client ticket like "category pages are empty for some customers" and cannot reproduce it on their own machine.

## Script

| Time | What happens |
|---|---|
| 0:00 | Who the user is. Show issue #1 in the demo repo. |
| 0:15 | Log in with GitHub, pick the repo and the issue, add a note ("Turkish phone, Chrome") and a screen recording. Click Investigate. |
| 0:30 | Timeline: Argon's reading of the ticket, the environment profile, the matrix running. |
| 1:15 | One variable isolated (locale). Root cause in the code. |
| 1:30 | Failing test goes red on the reporter profile, fix applied, matrix goes green. |
| 2:00 | Approval card with the fidelity report. Click Approve. The PR opens. |
| 2:20 | MongoDB: "seen this before" hit on a second bug, search facets by device, a cluster alert from Stream Processing. |
| 2:45 | One-line close. |

## Preparation before going on stage

- Run `ensureReady()` so the sandbox has Playwright and browsers.
- Reset the demo repo to the buggy state (tag `v0-buggy`).
- Pre-warm one run so API paths are warm.
- Start the Stream Processing processor only now, stop it after.
- Have the recorded fallback run ready in a second tab.
- Check that no secret appears on screen.

## If something breaks

- Sandbox slow: switch to the recorded run and say so.
- API 503: the app retries; if it persists, switch to the recording.
- Network down: play the recording.

## Avoid (from the challenge briefs)

- A static page with no verification loop.
- A chat wrapper.
- Any medical, mental-health or financial advice features.
- Code written before kickoff.
