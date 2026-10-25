# Architecture

## Overview

```
Browser (Next.js UI)
   │  GitHub login, repo + issue picker (triage badges), ticket form, live run page, approval card,
   │  revisions, reply drafts, dashboard, Ask the memory, Insights
   ▼
Next.js server (long-running process)
   ├─ Route handlers: auth, repos/issues, triage, runs, approve, stream (SSE), revision, reply, ask, insights
   ├─ Orchestrator (Node, in-process): the investigation loop and the deep investigation
   │     ├─ Argon (gemini-4-argon, Interactions API): understanding, replay plan, deep tool loop, root cause,
   │     │     test and fix, "why this happens", revisions
   │     ├─ gemini-3.8-flash: triage, pull request summary, reply drafts, Ask the memory
   │     └─ Sandbox interface ──► Antigravity managed agent on Argon (Linux, Playwright: Chromium, WebKit)
   ├─ Octokit: issues, files, git history, branch, commit, pull request, reviews, comments
   └─ MongoDB Atlas: tickets, runs, events, memory, notes between runs, approvals, pull request history, device catalog
         └─ Atlas Stream Processing: tickets ──► ticket_clusters (shared-bug alerts)
```

## Why a long-running process

An investigation takes minutes (a deep one up to about half an hour), starts in the background of the request that created it, and the run page holds a server-sent event stream open. Serverless execution limits fit that badly, so the app is built with `output: "standalone"` and runs as a Node process or a Docker container (`docs/DEPLOY.md`). For the hackathon it runs locally.

## Components

### Routes (`src/app/api`)

| Route | Purpose |
|---|---|
| `GET /api/auth/login`, `GET /api/auth/callback/github`, `POST /api/auth/logout`, `GET /api/session` | GitHub OAuth and the encrypted session |
| `GET /api/repos`, `GET /api/repos/[owner]/[name]/issues` | the user's repositories and a repo's open issues |
| `GET /api/repos/[owner]/[name]/triage` | badges for the issue list (environment-specific, looks like a fixed bug) |
| `POST /api/runs`, `GET /api/runs` | start an investigation, deep or quick (returns 202 with the run id; it continues in the background of the server process; at most 3 running and 12 per hour per user), list the user's recent runs (pull request state refreshed) |
| `GET /api/runs/[id]` | the run, its events in order and similar past fixes (voyage-code-4) for the approval card; refreshes the pull request state; a run still "running" after 60 minutes is marked interrupted |
| `GET /api/runs/[id]/stream` | server-sent events from a MongoDB change stream on the run, its events and its pull request history (the page reloads on each) |
| `POST /api/runs/[id]/stop` | asks a running investigation to stop after the step it is in |
| `POST /api/runs/[id]/approve` | the approval gate: claims the run, opens the pull request, writes `runs`, `approvals`, `run_events` and `pr_events` in one transaction |
| `POST /api/runs/[id]/reject` | records a rejection; nothing is pushed |
| `POST /api/runs/[id]/revision` | revise the pull request from reviewer comments (`start`), push the verified revision (`push`), or `discard` it |
| `POST /api/runs/[id]/reply` | draft a reply to the reporter of a bug that could not be reproduced, or post it on the issue |
| `POST /api/uploads` | a screen recording or screenshot (multipart, 50 MB) goes to the Gemini Files API; returns a reference for the ticket |
| `POST /api/warm`, `GET /api/warm` | start preparing a sandbox (Playwright, clone) when a repository is opened; its state for the ticket form |
| `POST /api/ask` | "Ask the memory" (function calling over MongoDB) |
| `GET /api/insights` | the Insights aggregations |
| `GET /api/memory` | what the memory has learned (Atlas Search facets) for the dashboard |
| `GET /api/clusters` | shared-bug alerts written by the stream processor |

Every run route checks that the run belongs to the signed-in user. Pages: `/`, `/insights`, `/repos/[owner]/[name]`, `/repos/[owner]/[name]/issues/[number]`, `/runs/[id]`.

### UI
- Login, repository list, issue list with triage badges, ticket form (free-text notes about the reporter, optional recording or screenshot, optional env vars, Deep or Quick).
- Run page pushed live by a change stream: timeline, Argon's thought summary, deep investigation counters, Stop.
- Approval card: root cause, why it happens (with sources), diff, failing test, what could not be emulated, similar past fixes, Approve and Reject. Afterwards: pull request state and revisions; for a bug that could not be reproduced, a reply draft.
- Dashboard: recent runs, shared-bug alerts, what it has learned, Ask the memory. Insights page.
- Contract for changing the look: `docs/UI.md`.

### Orchestrator (`src/lib/`)
- `config.ts`: model names and caps.
- `types.ts`: environment profile, sandbox interface, run events.
- `gemini.ts`: client, retry on 429/503, token budget per run (new, cached and peak context tokens).
- `redact.ts`, `mongo.ts`, `events.ts`, `schema.ts`: secret redaction, shared MongoDB client, run and event recording, validators and TTL.
- `agent/`: `argon.ts` (JSON output, streaming, conversation state), `schemas.ts`, `profiles.ts` (baseline, one-variable resets, stressors, overrides, failure signatures), `repo.ts` (file tree, on-demand reads, digest and git history from GitHub), `investigate.ts` (the loop), `deep.ts` (the deep investigation's tool loop), `verify.ts` (red test, fix, green tests, matrix), `explain.ts` (why the platform behaves so, with search and code execution), `ask.ts`, `triage.ts`, `reply.ts`, `pr.ts`.
- `harness/conditions.ts`: page translation, content blocker, removed APIs and slow network, shared by the matrix and the generated tests. `harness/scripts.ts`: scripts that run inside the sandbox.
- `prtrack.ts`, `revise.ts`, `insights.ts`, `memory.ts`, `devices.ts`, `media.ts`: pull request tracking, revisions, Insights aggregations, memory and search, device catalog, Files API.
- `agent/trail.ts` and `notes.ts`: what a run tries and learns, stored as notes on the issue when it ends without a fix, and handed to the next run of that issue (D-44).
- `sandbox/antigravity.ts`: the sandbox implementation.

See [STATUS.md](STATUS.md) for the full layout and how to run it, and [AGENT-LOOP.md](AGENT-LOOP.md) for the steps.

### Sandbox
Interface in `types.ts`. The implementation drives an Antigravity managed agent (on Argon) as a remote shell: one exact command per call, output returned untouched. That is fast (about 20 s and 12k tokens per call) compared with free-form tasks (about 2 min and 70k tokens).

Sandbox rules learned by measurement: heavy files go in `/opt` (calls get slower with bytes under `/workspace`), `/opt` is wiped after 15 idle minutes and can be reset between calls under load, so a call that finds its files missing sets the environment up again inside the same call; files are sent as checksummed heredocs. See DECISIONS D-12 to D-14 and D-42.

A Docker runner behind the same interface was planned as a fallback and never needed.

### Browser replay
Playwright inside the sandbox. A harness script takes a list of environment profiles and a step list and replays every profile in Chromium and WebKit within one sandbox call (four pages at a time per engine), returning a pass/fail table with console errors, page text and optional probe values. Conditions Playwright has no option for (page translation, content blocker, removed APIs, slow network) are init scripts and routes from `harness/conditions.ts`, used the same way by the generated tests.

### Data
MongoDB Atlas. See [MONGODB.md](MONGODB.md).

## Trust boundaries

- User env vars: passed to the sandbox only. Not stored in MongoDB. Redacted from logs and events. A run with env vars gets its own sandbox environment that is never reused.
- GitHub token: server-side session only (AES-256-GCM encrypted cookie); it never reaches the browser or the sandbox. The sandbox clones public repositories over plain HTTPS; private repositories are not supported yet (Q-03).
- Repository code runs only inside the sandbox.
- Every external write (pull request, revision push, comment on an issue) happens only after its own explicit click and is recorded (`approvals`, `pr_events`, `run_events`).

## Environment reconstruction

The model turns the ticket text and video into an `EnvProfile` (see `types.ts`): engine, viewport, device scale factor, touch and mobile flags, locale, timezone, colour scheme, reduced motion, storage availability, page translation, content blocker, removed APIs, network latency, plus a list of things that cannot be emulated. A device catalog in MongoDB supplies realistic numbers. Playwright and the harness apply everything they can; known gaps are reported on the approval card and in the pull request instead of hidden.

## Resilience

- Retry with exponential backoff on 429 and 503; a spending-cap 429 fails at once.
- Hard caps on matrix rounds, fix attempts, tokens per run, deep rounds, experiments and minutes (`LIMITS` in `config.ts`, constants in `deep.ts`).
- Sandbox: checksummed file transfers, in-call repair of a reset environment, the last exit code counts, a lost matrix result is retried once.
- Stop-and-ask path: if the agent cannot reproduce, or fixes keep failing, it reports what it tried and asks the developer (with a drafted reply to the reporter).
- Finished runs of every demo issue are kept in the app as the fallback for a live demo.
