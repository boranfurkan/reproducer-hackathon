// Schema validation for the collections that matter (MongoDB `$jsonSchema`, applied by `npm run db:setup` with collMod).
// The schemas state what every document must have and the types of the fields the app reads; other fields stay free, so adding a field
// to the app never needs a migration. Level "moderate": documents written before the validator existed stay readable and updatable.

const num = { bsonType: ["int", "long", "double"] };
const str = { bsonType: "string" };

export const validators: Record<string, object> = {
  runs: {
    bsonType: "object",
    required: ["repo", "issueNumber", "title", "status", "createdAt"],
    properties: {
      repo: { bsonType: "string", pattern: "^[^/]+/[^/]+$" },
      issueNumber: num,
      title: str,
      status: { enum: ["running", "fixed", "not_reproduced", "no_fix", "stopped", "failed"] },
      createdAt: { bsonType: "date" },
      tokensUsed: num,
      prNumber: num,
      prState: { enum: ["open", "merged", "closed"] },
      userLogin: str,
    },
  },
  bug_memory: {
    bsonType: "object",
    required: ["runId", "repo", "issueNumber", "title", "rootCause", "file", "isolatedVariable", "diff", "memoryText", "createdAt"],
    properties: {
      runId: { bsonType: "objectId" },
      repo: str,
      issueNumber: num,
      rootCause: str,
      file: str,
      isolatedVariable: str,
      diff: str,
      memoryText: str,
      outcome: { enum: ["open", "merged", "closed"] },
      createdAt: { bsonType: "date" },
    },
  },
  pr_events: {
    bsonType: "object",
    required: ["runId", "repo", "prNumber", "at", "kind", "state"],
    properties: {
      runId: { bsonType: "objectId" },
      prNumber: num,
      at: { bsonType: "date" },
      kind: { enum: ["opened", "review", "revised", "merged", "closed", "reopened"] },
      state: { enum: ["open", "merged", "closed"] },
    },
  },
  approvals: {
    bsonType: "object",
    required: ["runId", "login", "at", "prUrl"],
    properties: { runId: { bsonType: "objectId" }, login: str, at: { bsonType: "date" }, prUrl: str, branch: str },
  },
};

/** Documents that expire on their own: the reports the stream processor reads and the alerts it writes are only useful while they are recent. */
export const ttlIndexes = [
  { collection: "tickets", field: "createdAt", days: 30, name: "tickets_expire" },
  { collection: "ticket_clusters", field: "lastAt", days: 30, name: "clusters_expire" },
] as const;
