# MongoDB design

MongoDB Atlas is the core data store. The MongoDB bounty scores more points for using more Atlas features (confirmed by the MongoDB representative), so each feature below has a real job in the product.

Cluster: Atlas **M10** (dedicated, 2 GB RAM, 10 GB storage). Automated Embedding on a dedicated cluster requires **storage auto-scaling** to be enabled.

## Collections

| Collection | Contents |
|---|---|
| `tickets` | GitHub issue reference, text, developer notes, attachment references, extracted description, environment profile |
| `environments` | Device and browser catalog (names, profiles, aliases) |
| `runs` | One document per investigation: status, final result, token usage |
| `run_events` | One document per agent event. Kept separate from `runs` so documents do not grow without bound |
| `bug_memory` | Root cause, isolated variable, failing test, diff, outcome, text used for embeddings |
| `approvals` | Who approved what and when |
| `pr_events` | History of a run's pull request: opened, review activity, merged, closed |

Design rules (from the schema design skill): no unbounded arrays inside a document, embed data that is read together, reference data that grows. Events are the growing part, so they get their own collection with an index on `runId` and `at`.

Never stored: user env vars, tokens, API keys. Redact before writing events.

## Implemented so far

- Database `reproducer`, collections created by `npm run db:setup` (`scripts/setup-db.ts`, safe to repeat).
- Indexes: `run_events` on `{runId, seq}` (events carry a `seq` counter because timestamps can tie), `runs` on `{createdAt}` and `{status, createdAt}`, `tickets` on `{repo, issueNumber}`, `environments` on `{name}` (unique), `approvals` on `{runId}`.
- `src/lib/mongo.ts`: one shared client (stored on `globalThis`, pool of 10, 10 s server selection timeout).
- `src/lib/events.ts`: `startRun()` writes a `runs` document and returns `emit` (writes redacted `run_events`, payloads over 8,000 characters are truncated), `finish` and `fail`. A failed event write is logged and never stops the investigation.
- `src/lib/redact.ts`: removes Google keys, GitHub tokens, connection strings, bearer tokens and any exact secret values the caller passes in. Verified with a synthetic test: nothing leaked into `runs` or `run_events`.
- The `runs` document also carries what the approval step needs: `userLogin`, `issueUrl`, `profile`, final `matrix`, `understandingSummary`, `testContent`, `fixFiles`, `diff`, and after approval `prUrl`, `prNumber`, `prBranch`, `approvedAt` (or `rejectedAt`). `approvals` gets one document per opened pull request.
- `src/lib/memory.ts`: `bug_memory` writes (`recordMemory`, called from `finish` for verified runs), `recallSimilar` (`$rankFusion`: semantic 0.7, lexical 0.3), `similarFixes` (voyage-code-4 on the diff), `memoryFacets` (`$searchMeta`), and the index definitions. `npm run db:setup` creates the three indexes and waits until they are queryable (all READY on 24 Oct): `bug_memory_vector` (autoEmbed, voyage-4, path `memoryText`, filter `repo`), `bug_memory_code` (autoEmbed, voyage-code-4, path `diff`, filter `repo`), `bug_memory_search` (token and string fields for facets and text).
- `src/lib/devices.ts`: the `environments` catalog (10 devices), seeded by `db:setup`, with the `environments_search` Atlas Search index; `matchDevices` is a fuzzy `$search`.
- Verified with synthetic data: recall ranked the matching memory first, the diff search found the matching fix, facets counted correctly, embeddings were ready about 5 s after insert.
- Not built yet: `tickets` writes, Stream Processing.

## Feature map

| Feature | Use |
|---|---|
| Automated Embedding (Voyage) | `autoEmbed` vector index on `bug_memory` and `tickets` text fields, so there is no embedding code to write. Text only. Models: `voyage-4` for ticket text, `voyage-code-4` for diffs and code. Supported on all cluster tiers |
| Vector Search | "Which past bugs look like this one?" |
| Atlas Search | Full-text search over tickets, root causes and diffs. Facets by device, browser and locale for a dashboard |
| Hybrid Search | Combine text and vector results, then rerank, for the "seen this before?" step |
| Atlas Stream Processing | Tickets arrive in `tickets`; a processor reads the change stream, groups them in time windows and writes cluster alerts ("six reports from iPhone Safari in ten minutes") |
| Change streams | The run page subscribes to its run (`runs`, `run_events`, `pr_events`) through `GET /api/runs/[id]/stream` (server-sent events); no polling while it is connected |
| Aggregation (`$group`) | `memory_counts` in "Ask the memory": counts of fixes by isolating variable, engine, locale, PR outcome or file |
| Transactions | Approving a pull request, and every change to a pull request's state, write `runs`, `approvals` or `pr_events`, `run_events` and `bug_memory` together (`prtrack.ts`, the approve route) |

## Screenshots and video

Automated Embedding currently supports text only. Screenshots and video are first described by Argon, and that description is stored and embedded. Do not plan on multimodal embeddings through `autoEmbed`.

## Stream Processing notes

- There is no free tier. Billing runs while a processor is running.
- Plan: build and test on the smallest tier, start the processor only for the demo window, stop it right after.
- Managing workspaces and processors needs the MongoDB MCP Server with Atlas API credentials.
- An Atlas cluster can be a source (change stream), not only a sink.
- Cost to verify on the Atlas page before starting.

## Connection

One shared client per process (module-level, reused across requests). Pool and timeout settings follow the connection skill.

## Setup checklist

- [ ] Atlas cluster created, network access set, database user created
- [ ] `MONGODB_URI` in `.env.local`
- [ ] Collections and indexes created by a script in `scripts/` (not by hand)
- [ ] `autoEmbed` index on `bug_memory`
- [ ] Atlas Search index with facet fields
- [ ] Hybrid search query verified
- [ ] Stream processing workspace (last)
