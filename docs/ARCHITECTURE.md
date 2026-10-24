# Architecture

## Overview

```
Browser (Next.js UI)
   │  GitHub login, repo + issue picker, ticket form, live timeline, approval card
   ▼
Next.js server (long-running container)
   ├─ Route handlers: auth, repos/issues, start run, approve, event stream
   ├─ Orchestrator (Node, in-process): the investigation loop
   │     ├─ Argon (gemini-4-argon, Interactions API): reasoning, planning, code
   │     ├─ gemini-3.8-flash: PR text, timeline labels
   │     └─ Sandbox interface ──► Antigravity managed agent (Linux, Playwright)
   ├─ Octokit: issues, branch, commit, pull request
   └─ MongoDB Atlas: tickets, runs, events, memory, approvals
```

## Why a long-running container

An investigation takes minutes and the UI needs a live event stream. Serverless execution limits fit that badly, so the app is built with `output: "standalone"` and runs as a Docker container (Cloud Run with min instances 1, or any equivalent). Next.js documents Docker as a fully supported target.

Long model calls use `background=True` on the Interactions API, so the orchestrator can poll and survive a restart.

## Components

### Routes (`src/app/api`)

| Route | Purpose |
|---|---|
| `GET /api/auth/login`, `GET /api/auth/callback/github`, `POST /api/auth/logout`, `GET /api/session` | GitHub OAuth and the encrypted session |
| `GET /api/repos`, `GET /api/repos/[owner]/[name]/issues` | the user's repositories and a repo's open issues |
| `POST /api/runs`, `GET /api/runs` | start an investigation (returns 202 with the run id; it continues in the background of the server process), list the user's recent runs |
| `GET /api/runs/[id]` | the run and its events in order (the page polls this) |
| `POST /api/runs/[id]/approve` | the approval gate: claims the run, opens the pull request, writes `approvals` and a `pr_opened` event |
| `POST /api/runs/[id]/reject` | records a rejection; nothing is pushed |

Every run route checks that the run belongs to the signed-in user. Pages: `/`, `/repos/[owner]/[name]`, `/repos/[owner]/[name]/issues/[number]`, `/runs/[id]`.

### UI
- Login, repo list, issue list, ticket form (free-text environment notes, optional video or screenshot, optional env vars).
- Live timeline fed by the `run_events` collection.
- Approval card: root cause, diff, failing test, fidelity report, Approve and Reject.

### Orchestrator (`src/lib/`)
- `config.ts`: model names and caps.
- `types.ts`: environment profile, sandbox interface, run events.
- `gemini.ts`: client, retry on 429/503, token budget per run.
- `redact.ts`, `mongo.ts`, `events.ts`: secret redaction, shared MongoDB client, run and event recording.
- `agent/`: `argon.ts` (JSON output), `schemas.ts`, `profiles.ts` (baseline and ablations), `repo.ts` (repo digest from GitHub), `investigate.ts` (the loop).
- `harness/scripts.ts`: scripts that run inside the sandbox.
- `sandbox/antigravity.ts`: the sandbox implementation.
- Still to build: `github.ts` (PR creation), approval handling, search and memory queries.
See [STATUS.md](STATUS.md) for the full layout and how to run it.

### Sandbox
Interface in `types.ts`. Primary implementation drives an Antigravity managed agent as a remote shell: one exact command per call, output returned untouched. This is fast (about 22 s and 12k tokens per call measured) compared with free-form tasks (about 2 min and 70k tokens).

Sandbox rules learned by measurement: heavy files go in `/opt` (calls get slower with bytes under `/workspace`), `/opt` is wiped after 15 idle minutes, and files are sent as checksummed heredocs. See DECISIONS D-12 to D-14.

Fallback implementation: a Docker runner behind the same interface. Only built if Antigravity blocks us.

### Browser replay
Playwright inside the sandbox. A harness script takes a list of environment profiles and a step list and replays them in parallel inside one sandbox call, returning a pass/fail table plus console and network logs. Engines: Chromium, WebKit (Firefox needs `MOZ_DISABLE_CONTENT_SANDBOX=1` in the sandbox).

### Data
MongoDB Atlas. See [MONGODB.md](MONGODB.md).

## Trust boundaries

- User env vars: passed to the sandbox only. Not stored in MongoDB. Redacted from logs and events.
- GitHub token: server-side session only. The sandbox gets repo access through a scoped credential (investigate using the Antigravity credentials feature); the agent does not see the raw token.
- Repo code runs only inside the sandbox.
- Any external write (branch push, PR) happens only after an explicit approval click, and is recorded in `approvals`.

## Environment reconstruction

The model turns the ticket text and video into an `EnvProfile` (see `types.ts`): engine, viewport, device scale factor, touch and mobile flags, locale, timezone, colour scheme, storage availability, plus a list of things we cannot emulate. Playwright applies everything it can. Known gaps are reported in the fidelity report instead of hidden. Example found in testing: with `locale: "tr-TR"`, Chromium does not change the default locale used by a no-argument `toLocaleUpperCase()`, while WebKit and Firefox do.

## Resilience

- Retry with exponential backoff on 429 and 503.
- Hard caps on matrix rounds, fix attempts and tokens per run.
- Stop-and-ask path: if the agent cannot reproduce, or fixes keep failing, it reports what it tried and asks the developer.
- A recorded successful run is kept as a fallback for the live demo.
