// Create the collections and indexes the app needs. Safe to run repeatedly: npm run db:setup
import { seedDevices } from "../src/lib/devices";
import { ensureMemoryIndexes } from "../src/lib/memory";
import { COLLECTIONS, closeMongo, db } from "../src/lib/mongo";

async function main() {
  const database = await db();
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) await database.createCollection(name);
  }

  // Timeline reads: all events of one run in order.
  await database.collection("run_events").createIndex({ runId: 1, seq: 1 }, { name: "run_timeline_seq" });
  await database.collection("run_events").dropIndex("run_timeline").catch(() => undefined);
  // Run lists: newest first, and by status.
  await database.collection("runs").createIndex({ createdAt: -1 }, { name: "runs_recent" });
  await database.collection("runs").createIndex({ status: 1, createdAt: -1 }, { name: "runs_by_status" });
  // Tickets are looked up by repo and issue.
  await database.collection("tickets").createIndex({ repo: 1, issueNumber: 1 }, { name: "ticket_issue" });
  // Environment catalog: unique profile names.
  await database.collection("environments").createIndex({ name: 1 }, { unique: true, name: "env_name" });
  // Approvals belong to a run.
  await database.collection("approvals").createIndex({ runId: 1 }, { name: "approval_run" });

  // Pull request history of a run (opened, review activity, merged, closed): read per run, newest last.
  await database.collection("pr_events").createIndex({ runId: 1, at: 1 }, { name: "pr_run_time" });

  const out: Record<string, string[]> = {};
  for (const name of COLLECTIONS) out[name] = (await database.collection(name).indexes()).map((i) => i.name ?? "?");
  console.log("Collections and indexes:", JSON.stringify(out, null, 2));

  console.log("Device catalog: added", await seedDevices(), "devices");

  // Atlas Search and Vector Search indexes on bug_memory (Automated Embedding): created asynchronously by Atlas, so wait for them.
  console.log("Search indexes on bug_memory:", JSON.stringify(await ensureMemoryIndexes(), null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeMongo);
