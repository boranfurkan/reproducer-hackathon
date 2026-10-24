// Paste into mongosh connected to the Stream Processing workspace (Atlas > Stream Processing > workspace > Connect > Shell).
// The pipeline is the same file as ticketClusters.json; it is inlined here so the paste is one step.
sp.createStreamProcessor("ticketClusters", [
  { $source: { connectionName: "cluster0", db: "reproducer", coll: "tickets", fullDocument: "updateLookup", pipeline: [{ $match: { operationType: "insert" } }] } },
  { $replaceRoot: { newRoot: "$fullDocument" } },
  {
    $hoppingWindow: {
      interval: { size: 10, unit: "minute" },
      hopSize: { size: 1, unit: "minute" },
      pipeline: [
        {
          $group: {
            _id: { repo: "$repo", engine: "$environment.engine", locale: "$environment.locale" },
            count: { $sum: 1 },
            users: { $addToSet: "$userLogin" },
            lastAt: { $max: "$createdAt" },
          },
        },
      ],
    },
  },
  { $addFields: { users: { $size: "$users" } } },
  { $match: { count: { $gte: 3 } } },
  { $merge: { into: { connectionName: "cluster0", db: "reproducer", coll: "ticket_clusters" }, on: "_id", whenMatched: "replace", whenNotMatched: "insert" } },
]);
sp.ticketClusters.start();
// Stop it when the demo is over (a running processor keeps billing):  sp.ticketClusters.stop()
