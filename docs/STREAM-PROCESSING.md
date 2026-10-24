# Atlas Stream Processing: shared-bug alerts

Several reports from the same environment in a short time usually mean one bug, not several. A stream processor watches new tickets, counts them per environment in a sliding window, and writes an alert when the count passes a threshold. The dashboard shows the alerts under "Possible shared bugs".

## What the app already does

- Every investigation writes one document to `reproducer.tickets` as soon as the reporter's environment is known (`src/lib/events.ts`, shape `TicketDoc`): `runId`, `userLogin`, `repo`, `issueNumber`, `title`, `createdAt`, and `environment` (`engine`, `locale`, `timezoneId`, `mobile`).
- `GET /api/clusters` reads `reproducer.ticket_clusters` (the collection the processor writes to) and the dashboard shows the latest five. Until the processor runs the collection is empty and the card is hidden.
- `npm run db:setup` creates `tickets` and `ticket_clusters`.

## What needs a human with Atlas access (about 10 minutes)

Stream Processing has **no free tier** and bills while a processor runs. Create it, start it only for the demo window, stop it right after. I could not do this part myself: managing workspaces needs Atlas API credentials (or the MongoDB MCP server with them), which this project does not have.

1. In Atlas, open the project, then **Stream Processing** (left menu) and **Create workspace**. Choose the smallest tier (SP2 is enough for this), the same cloud provider and region as the cluster, and name it `reproducer`.
2. In the workspace, **Connection Registry**, add a connection of type **Atlas Database**: pick the cluster, name the connection `cluster0`, role **readWriteAnyDatabase** (or a more limited role on the `reproducer` database).
3. **Create processor** (or use `mongosh` against the workspace connection string) with the pipeline below. Name it `ticketClusters`.
4. Use the processor's preview or `sp.ticketClusters.start()` to start it. Check `reproducer.ticket_clusters` after starting three investigations from the same environment within ten minutes.
5. Stop it when you are done (`sp.ticketClusters.stop()`): a running processor keeps billing.

## Ready-made files

- `scripts/stream/create-processor.js`: paste it into `mongosh` connected to the workspace; it creates the processor `ticketClusters` and starts it.
- `scripts/stream/ticketClusters.json`: the same pipeline as plain JSON (for the Atlas UI "Create processor" JSON editor).
- `npm run demo:cluster`: inserts three demo tickets from one environment (marked `demo: true`) so an alert appears within about a minute; `npm run demo:cluster -- --clean` removes them and the alert.
- Verified without Atlas on 25 October: the grouping, the user count and the threshold produce exactly one alert for the three demo tickets, in the shape `GET /api/clusters` reads (`_id.repo/engine/locale`, `count`, `users`, `lastAt`), and the dashboard route returns it.

## The pipeline

```json
[
  { "$source": {
      "connectionName": "cluster0",
      "db": "reproducer",
      "coll": "tickets",
      "fullDocument": "updateLookup",
      "pipeline": [{ "$match": { "operationType": "insert" } }]
  } },
  { "$replaceRoot": { "newRoot": "$fullDocument" } },
  { "$hoppingWindow": {
      "interval": { "size": 10, "unit": "minute" },
      "hopSize": { "size": 1, "unit": "minute" },
      "pipeline": [
        { "$group": {
            "_id": { "repo": "$repo", "engine": "$environment.engine", "locale": "$environment.locale" },
            "count": { "$sum": 1 },
            "users": { "$addToSet": "$userLogin" },
            "lastAt": { "$max": "$createdAt" }
        } }
      ]
  } },
  { "$addFields": { "users": { "$size": "$users" } } },
  { "$match": { "count": { "$gte": 3 } } },
  { "$merge": {
      "into": { "connectionName": "cluster0", "db": "reproducer", "coll": "ticket_clusters" },
      "on": "_id",
      "whenMatched": "replace",
      "whenNotMatched": "insert"
  } }
]
```

In `mongosh` connected to the workspace:

```javascript
sp.createStreamProcessor("ticketClusters", [ /* the stages above */ ])
sp.ticketClusters.start()
```

Each hop of the window emits the current counts, and `$merge` upserts them by the group key, so one alert per repo, engine and locale is kept up to date. The dashboard reads `count`, `users` and `lastAt`.

## Not verified

The pipeline follows the patterns in the MongoDB Stream Processing skill (`skills/.agents/skills/mongodb-atlas-stream-processing`) but has **not been run on Atlas**. Things to check first if it fails: that `$addToSet` and `$max` are accepted inside the window (use `$push` or `$last` otherwise), that the connection role allows writing `ticket_clusters`, and that the workspace and the cluster are reachable from each other.

## For the demo

To show an alert without waiting, start three investigations from the same environment (for example the Turkish Z Flip notes on issue #1) within ten minutes, or insert three `tickets` documents by hand with the same `environment`.
