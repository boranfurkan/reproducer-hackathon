// Paste into mongosh connected to the Stream Processing workspace (or run: npx tsx scripts/stream/setup.ts).
// Every new ticket (one per investigation) updates one counter per repo, engine and locale in ticket_clusters; the dashboard shows the
// counters that reached three reports. The same pipeline as ticketClusters.json.
sp.createStreamProcessor("ticketClusters", [
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
]);
sp.ticketClusters.start();
// Stop it when the demo is over (a running processor keeps billing):  sp.ticketClusters.stop()
