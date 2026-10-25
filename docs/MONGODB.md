# MongoDB design

MongoDB Atlas is the data store for everything the app knows. The MongoDB bounty scores more points for using more Atlas features (confirmed by the MongoDB representative), so each feature below has a real job in the product.

Cluster: Atlas **M10** (dedicated, 2 GB RAM, 10 GB storage, server 8.0.34). Automated Embedding on a dedicated cluster requires **storage auto-scaling** to be enabled (it is).

## Collections

| Collection | Contents |
|---|---|
| `tickets` | One document per investigation once the reporter's environment is known: repository, issue, reporter, `environment` (engine, locale, timezone, mobile). The stream processor's input; expires after 30 days |
| `environments` | Device and browser catalog (11 devices: names, aliases, profiles) |
| `runs` | One document per investigation: status, mode (deep or quick), profile, matrix, root cause, explanation, test, fix, diff, token use, the live thought summary, and after approval the pull request and its state |
| `run_events` | One document per step of a run (the timeline and the audit trail). Kept separate from `runs` so documents do not grow without bound; never expires |
| `bug_memory` | One entry per verified fix and issue: symptom, root cause, file, isolating variable, environment, diff, the pull request's outcome, and the text that is embedded |
| `approvals` | Who approved which pull request and when |
| `pr_events` | History of a run's pull request: opened, reviews and comments, merged, closed, revisions |
| `ticket_clusters` | The stream processor's counters per repository, engine and locale (the shared-bug alerts); expires 30 days after the last ticket |
| `issue_notes` | One document per run that ended without a verified fix: every environment it replayed with the result, files, searches and commits it read, its best explanation and what was missing, fixes that verification rejected. The next run of the same issue starts from them; a verified fix resolves them (D-44) |

Design rules (from the schema design skill): no unbounded arrays inside a document, embed data that is read together, reference data that grows. Events are the growing part, so they get their own collection with an index on `runId` and `seq`.

Never stored: user env vars, tokens, API keys. Everything written to `runs` and `run_events` is redacted first (`src/lib/redact.ts`: Google keys, GitHub tokens, connection strings, bearer tokens and the exact secret values of the run).

## Features and where they are used

| Feature | Where | What it does |
|---|---|---|
| **Automated Embedding** (Voyage) | `bug_memory_vector` (`voyage-4` on `memoryText`), `bug_memory_code` (`voyage-code-4` on `diff`), both with a `repo` filter | Embeddings are made by Atlas on insert (ready about 5 s later); the app has no embedding code |
| **Vector Search** | `similarBySymptom`, `similarFixes` in `src/lib/memory.ts` | Issue list badge "looks like repo#N, fixed" (cosine ≥ 0.76); "Similar past fixes" on the approval card by diff (≥ 0.85) |
| **Hybrid Search** (`$rankFusion`) | `recallSimilar` | "Have we seen this before?" before the fix proposal: vector search (weight 0.7) fused with lexical search (0.3), outcome-weighted, semantic score ≥ 0.82, never the same issue. Also behind `search_memory` in Ask the memory |
| **Atlas Search** | `bug_memory_search`, `environments_search` | Lexical half of the hybrid search; `$searchMeta` facets (isolating variable, engine, locale) for "What it has learned" on the dashboard; fuzzy search of the device catalog (`matchDevices`), so "Samsng Galaxy Z Flip" or "iPhone 8 she never updated" finds the device |
| **Atlas Stream Processing** | processor `ticketClusters` (`docs/STREAM-PROCESSING.md`) | Reads new `tickets` from a change stream and keeps one counter per repository, engine and locale with `$merge` and an update pipeline; three reports from one environment become a "Possible shared bug" alert (`GET /api/clusters`) |
| **Change streams** | `GET /api/runs/[id]/stream` | The run page is pushed live: `db.watch()` filtered to the run, its events and its pull request history, forwarded as server-sent events (about 70 ms to the browser) |
| **Transactions** | approve route, `prtrack.ts`, `revise.ts` | Each is one multi-document transaction: approving (`runs`, `approvals`, `run_events`, `pr_events`), a change of the pull request's state and pushing a revision (`runs`, `pr_events`, `run_events`, `bug_memory`) |
| **Memory that learns** | `OUTCOME_WEIGHT` in `memory.ts` | The pull request's outcome is stored on the memory entry and weights recall: merged ×1.25, closed ×0.6 |
| **Notes between runs** | `src/lib/notes.ts`, index `notes_issue_recent` | A run that did not fix its issue stores what it tried; the next run of that issue loads the open notes (newest first), builds on them, and reuses stored experiment results on the same code; a verified fix marks them resolved |
| **Aggregation pipelines** | `src/lib/insights.ts`, `memory_counts` in `src/lib/agent/ask.ts` | The Insights page (`$dateTrunc`, `$group`, `$setWindowFields` running totals, `$cond`, `$avg`, `$lookup` into `pr_events`); grouped counts for Ask the memory |
| **Schema validation** (`$jsonSchema`) | `src/lib/schema.ts`, applied by `db:setup` | `runs`, `bug_memory`, `pr_events`, `approvals`, `issue_notes` reject malformed documents (code 121); other fields stay free |
| **TTL indexes** | `tickets_expire`, `clusters_expire` | `tickets` and `ticket_clusters` expire after 30 days |

## Indexes

Created by `npm run db:setup` (`scripts/setup-db.ts`, safe to repeat; it waits until the search indexes are queryable):

- `run_events` `{runId, seq}` (events carry a `seq` counter because timestamps can tie), `runs` `{createdAt}` and `{status, createdAt}`, `tickets` `{repo, issueNumber}`, `environments` `{name}` (unique), `approvals` `{runId}`, `pr_events` `{runId, at}`, `issue_notes` `{repo, issueNumber, createdAt}`, plus the two TTL indexes.
- Search indexes: `bug_memory_vector`, `bug_memory_code`, `bug_memory_search`, `environments_search`.

## Thresholds (measured on the real memory)

A fused rank only orders results (`$rankFusion` gave 0.016 to every hit), so every threshold uses the cosine score of `$vectorSearch`:
- Issue text against memory: related bugs 0.78 to 0.85, unrelated 0.62 to 0.72. Threshold 0.76 (triage badges).
- The loop's recall query shares the memory text's template, which lifts every score: the same bug 0.89 to 0.92, unrelated ones up to 0.80. Threshold 0.82.
- Diffs: 0.85 for "Similar past fixes".

## Screenshots and video

Automated Embedding supports text only. Screenshots and video are described by Argon first, and that description is stored and embedded.

## Stream Processing

Running on Atlas since the night of 24 to 25 October, billed while it runs (no free tier). Stop it after the presentation. The workspace accepts the `sp` commands through the normal driver, so no extra tooling was needed. Details, the pipeline and why it counts instead of using a time window: `docs/STREAM-PROCESSING.md`.

## Connection

One shared client per process (stored on `globalThis`, pool of 10, 10 s server selection timeout), reused across requests (`src/lib/mongo.ts`). A failed event write is logged and never stops an investigation.
