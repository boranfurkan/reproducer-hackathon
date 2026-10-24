# Demo

Three minutes, live, no slides. The Gemini score is 50% working live demo, 25% problem and usefulness, 15% originality and need for Argon, 10% clarity.

## User

A developer who gets a client ticket like "category pages are empty for some customers" and cannot reproduce it on their own machine.

## Script

| Time | What happens |
|---|---|
| 0:00 | Who the user is. The issue list: triage badges say which issues look environment-specific and which look like a fix already in memory. |
| 0:15 | Log in with GitHub (already done), open issue #1, add a note ("Turkish phone, Chrome") and a screen recording. Click Investigate. |
| 0:30 | The run page is live (MongoDB change stream): Argon's thought summary streams in, the recording's key moments with times, the environment profile, the matrix filling in (two engines per row). |
| 1:15 | One variable isolated (locale). Root cause in the code, and "Why this happens": the platform rule with sources and a snippet the model ran (Search grounding, code execution). |
| 1:30 | Failing test goes red on the reporter profile, fix applied, matrix goes green. |
| 2:00 | Approval card with the fidelity report. Click Approve (one transaction). The PR opens. |
| 2:15 | A reviewer comments: "Address review feedback". A verified revision appears; Push adds a commit and replies to the reviewer. The PR chip updates itself (merged or closed feeds back into memory). |
| 2:35 | MongoDB: "Ask the memory" (function calling), Insights (aggregations), the learned panel. |
| 2:50 | One-line close. |

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

## Recording a draft automatically

`npm run demo:record` drives the real web app through one investigation with Playwright and records it, so there is always a recording to fall back on or to speed up:

```bash
npm run dev    # or: npm run build && npm start, in another terminal
GITHUB_TOKEN=$(gh auth token) npm run demo:record -- 2 --notes "iPhone, opened from an in-app browser, language English (UK)"
# optional: --media path/to/recording.webm to attach a screen recording, --base https://your-host
```

It signs in with a session cookie built from `AUTH_SECRET` and the token (the GitHub login screen is not recorded), types the notes, clicks Investigate, waits for the run to end and stops at the approval card (it never clicks Approve; do that yourself live). Output in `.demo/<time>/`: `raw.webm`, `fast.webm` (8x, made with the ffmpeg that Playwright ships), and `result.png`. The token is only used to read issues and to start the run.

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
