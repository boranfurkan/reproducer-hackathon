import { MongoClient, type Collection, type Db } from "mongodb";

// One client per process, reused by every request. It is stored on globalThis so Next.js dev reloads do not open a new pool each time.
// maxPoolSize 10: a long-running container with a handful of concurrent investigations, each doing short writes.
// serverSelectionTimeoutMS 10 s: fail fast with a clear error instead of hanging the run.
const globalForMongo = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

export function mongoClient(): Promise<MongoClient> {
  if (!globalForMongo._mongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    globalForMongo._mongoClient = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 }).connect();
  }
  return globalForMongo._mongoClient;
}

export const DB_NAME = "reproducer";

export async function db(): Promise<Db> {
  return (await mongoClient()).db(DB_NAME);
}

export async function collection<T extends object>(name: CollectionName): Promise<Collection<T>> {
  return (await db()).collection<T>(name);
}

/** Every collection the app uses. See docs/MONGODB.md. */
export const COLLECTIONS = ["tickets", "environments", "runs", "run_events", "bug_memory", "approvals"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export async function closeMongo(): Promise<void> {
  const p = globalForMongo._mongoClient;
  if (p) {
    globalForMongo._mongoClient = undefined;
    await (await p).close();
  }
}
