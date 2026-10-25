# Atlas Stream Processing: shared-bug alerts

Several reports from the same environment usually mean one bug, not several. A stream processor watches new tickets and keeps one counter per repository, browser engine and locale; a counter that reaches three reports is shown on the dashboard under "Possible shared bug".

**Status (25 October): created, run and verified on Atlas.** Workspace `reproducer` (London), connection `cluster0`, processor `ticketClusters` (tier SP10). Three demo tickets from one environment produced the alert 3 seconds later (count 3, three distinct reporters), and `GET /api/clusters` returned it. The processor is **stopped** to avoid billing while idle (there is no free tier): start it for the demo window, stop it right after.

## Run it

```bash
export STREAM_PROCESSING_URI='mongodb://USER:PASSWORD@atlas-stream-....a.query.mongodb.net/?tls=true&authSource=admin'   # from Atlas: workspace > Connect
npx tsx scripts/stream/setup.ts            # create and start (replaces nothing: use --drop first if it exists)
npx tsx scripts/stream/setup.ts --status   # state and stats
npx tsx scripts/stream/setup.ts --stop     # stop (stops billing)
npx tsx scripts/stream/setup.ts --drop     # delete
npm run demo:cluster                       # three demo tickets from one environment: the alert appears in seconds
npm run demo:cluster -- --clean            # remove the demo tickets and the alert
```

Or in `mongosh` connected to the workspace: `sp.ticketClusters.start()` / `sp.ticketClusters.stop()`. The connection string contains the database user's password: keep it in the shell, never in the repository.

## What the app does

- Every investigation writes one document to `reproducer.tickets` as soon as the reporter's environment is known (`src/lib/events.ts`, shape `TicketDoc`): `runId`, `userLogin`, `repo`, `issueNumber`, `title`, `createdAt`, `environment` (`engine`, `locale`, `timezoneId`, `mobile`).
- The processor reads those inserts (change stream) and upserts `reproducer.ticket_clusters`: `_id` is `{ repo, engine, locale }`, with `count`, `users` (distinct reporters), `userSet`, `firstAt`, `lastAt`.
- `GET /api/clusters` returns the counters with `count >= 3`, newest first; the dashboard shows them. `tickets` and `ticket_clusters` expire after 30 days (TTL).
- The files: `scripts/stream/ticketClusters.json` (the pipeline), `scripts/stream/create-processor.js` (mongosh paste), `scripts/stream/setup.ts` (the commands above).

## The pipeline

```json
[
  {
    "$source": {
      "connectionName": "cluster0",
      "db": "reproducer",
      "coll": "tickets",
      "config": {
        "pipeline": [
          {
            "$match": {
              "operationType": "insert"
            }
          }
        ]
      }
    }
  },
  {
    "$replaceRoot": {
      "newRoot": "$fullDocument"
    }
  },
  {
    "$project": {
      "_id": {
        "repo": "$repo",
        "engine": "$environment.engine",
        "locale": "$environment.locale"
      },
      "count": {
        "$literal": 1
      },
      "users": {
        "$literal": 1
      },
      "userSet": [
        "$userLogin"
      ],
      "firstAt": "$createdAt",
      "lastAt": "$createdAt"
    }
  },
  {
    "$merge": {
      "into": {
        "connectionName": "cluster0",
        "db": "reproducer",
        "coll": "ticket_clusters"
      },
      "on": "_id",
      "whenMatched": [
        {
          "$set": {
            "count": {
              "$add": [
                "$count",
                "$$new.count"
              ]
            },
            "userSet": {
              "$setUnion": [
                "$userSet",
                "$$new.userSet"
              ]
            },
            "lastAt": {
              "$max": [
                "$lastAt",
                "$$new.lastAt"
              ]
            }
          }
        },
        {
          "$set": {
            "users": {
              "$size": "$userSet"
            }
          }
        }
      ],
      "whenNotMatched": "insert"
    }
  }
]
```

`$merge` with an update pipeline (`whenMatched: [...]`) bumps the counter in place: `count` adds one, `userSet` is the union of reporters, `lastAt` the latest time, `users` its size. The first ticket of an environment inserts the counter.

## Why not a time window

The first version used `$hoppingWindow` (ten minutes, hopping every minute). It never produced output: a window closes only when the event-time watermark passes its end, and with a quiet source the watermark stalls (the stats showed the three inputs and `watermark` frozen at the last ticket). This Atlas version has no idle timeout on the change-stream source (the options `idleTimeout` in `$source` and `$source.config` are rejected). The counter version does not depend on the watermark, so an alert appears on the third ticket. The trade-off: a counter counts all tickets of that environment, not only those of the last ten minutes; `lastAt` is shown and old counters expire after 30 days.

## Things learned about this Atlas version

- Options of the change-stream `$source` such as the pushdown `pipeline` go under `config` (`$source.config.pipeline`), not directly in `$source`; `fullDocument` is rejected there (inserts carry the full document).
- The workspace accepts the same commands as `mongosh`'s `sp` helper through the driver: `createStreamProcessor`, `startStreamProcessor`, `stopStreamProcessor`, `dropStreamProcessor`, `listStreamProcessors`, `getStreamProcessorStats`.
