# MongoDB design

MongoDB Atlas is the core data store. The MongoDB bounty scores more points for using more Atlas features (confirmed by the MongoDB representative), so each feature below has a real job in the product.

## Collections

| Collection | Contents |
|---|---|
| `tickets` | GitHub issue reference, text, developer notes, attachment references, extracted description, environment profile |
| `environments` | Device and browser catalog (names, profiles, aliases) |
| `runs` | One document per investigation: status, final result, token usage |
| `run_events` | One document per agent event. Kept separate from `runs` so documents do not grow without bound |
| `bug_memory` | Root cause, isolated variable, failing test, diff, outcome, text used for embeddings |
| `approvals` | Who approved what and when |

Design rules (from the schema design skill): no unbounded arrays inside a document, embed data that is read together, reference data that grows. Events are the growing part, so they get their own collection with an index on `runId` and `at`.

Never stored: user env vars, tokens, API keys. Redact before writing events.

## Feature map

| Feature | Use |
|---|---|
| Automated Embedding (Voyage) | `autoEmbed` vector index on `bug_memory` and `tickets` text fields, so there is no embedding code to write. Text only. Models: `voyage-4` for ticket text, `voyage-code-4` for diffs and code. Supported on all cluster tiers |
| Vector Search | "Which past bugs look like this one?" |
| Atlas Search | Full-text search over tickets, root causes and diffs. Facets by device, browser and locale for a dashboard |
| Hybrid Search | Combine text and vector results, then rerank, for the "seen this before?" step |
| Atlas Stream Processing | Tickets arrive in `tickets`; a processor reads the change stream, groups them in time windows and writes cluster alerts ("six reports from iPhone Safari in ten minutes") |
| Change streams | The live timeline subscribes to `run_events` |

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
