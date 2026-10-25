// Create, start, inspect or stop the Atlas Stream Processing processor `ticketClusters` from the command line (the same commands mongosh's
// `sp` helper sends). The workspace connection string comes from STREAM_PROCESSING_URI (never committed):
//   STREAM_PROCESSING_URI='mongodb://user:password@atlas-stream-....a.query.mongodb.net/?tls=true&authSource=admin' npx tsx scripts/stream/setup.ts
// Flags: (none) create and start, --status, --stop, --drop
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const NAME = "ticketClusters";

async function main() {
  const uri = process.env.STREAM_PROCESSING_URI;
  if (!uri) throw new Error("STREAM_PROCESSING_URI is not set");
  const pipeline = JSON.parse(readFileSync(new URL("./ticketClusters.json", import.meta.url), "utf8"));
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 }).connect();
  const db = client.db("admin");
  const run = async (cmd: Record<string, unknown>) => {
    try {
      return await db.command(cmd);
    } catch (e) {
      return { error: (e as Error).message.slice(0, 300) };
    }
  };
  const arg = process.argv.slice(2);
  try {
    if (arg.includes("--status")) {
      console.log("processors:", JSON.stringify(await run({ listStreamProcessors: 1 })));
      console.log("stats:", JSON.stringify(await run({ getStreamProcessorStats: NAME })));
    } else if (arg.includes("--stop")) {
      console.log("stop:", JSON.stringify(await run({ stopStreamProcessor: NAME })));
    } else if (arg.includes("--drop")) {
      await run({ stopStreamProcessor: NAME });
      console.log("drop:", JSON.stringify(await run({ dropStreamProcessor: NAME })));
    } else {
      console.log("connected; existing processors:", JSON.stringify(await run({ listStreamProcessors: 1 })));
      console.log("create:", JSON.stringify(await run({ createStreamProcessor: NAME, pipeline, options: {} })));
      console.log("start:", JSON.stringify(await run({ startStreamProcessor: NAME })));
      console.log("status:", JSON.stringify(await run({ listStreamProcessors: 1 })));
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error("failed:", (e as Error).message.replace(/\/\/[^@/]*@/, "//***@"));
  process.exitCode = 1;
});
