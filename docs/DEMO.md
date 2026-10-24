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

## Format (confirmed by another participant, not by the organisers)

The demo does not have to be live: a screen recording, sped up, is acceptable. Teams in the top 10 pitch live in front of the audience, expected around 3 pm on Sunday 25 October (after submission closes at 12:00). So the 3-minute limit no longer constrains the design: record a full run, speed up the waiting parts, and keep the pitch itself live and short. Ask the organisers to confirm the schedule.

## Timing

A warm run takes about 3 minutes (Argon about 20 s of it, sandbox about 165 s). The demo narrates while it runs; time-sensitive parts are pre-recorded and said so.

## Suggested order of the recorded runs

1. Issue #1 (Turkish category pages): the straightforward case, reporter's own environment.
2. Issue #4 (search finds nothing for Turkish customers): the timeline shows "Seen something similar before: Category pages empty for some customers" (memory from run 1), and a stronger first guess.
3. Issue #2 (blank page): the reporter's profile passes; only an added condition (blocked storage) reproduces it. This is the best illustration of why the matrix tries conditions the report never mentioned.
4. Issue #3 (wrong pickup day): timezone, with a recording attached to show the video input.

Show the dashboard last: the memory facets ("what it has learned") and, if Stream Processing is running, a shared-bug alert.

## Preparation before going on stage

- Warm the sandbox: run one investigation (the boot installs Playwright into `/opt`, about 2 minutes) and keep pinging the environment at least every 10 minutes, because `/opt` is wiped after 15 idle minutes. Pass the same environment id to the demo run.
- Reset the demo repo to the buggy state (tag `v0-buggy`, or the all-bugs tag once it exists). See STATUS.md.
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
