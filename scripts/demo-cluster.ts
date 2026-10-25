// Make a shared-bug alert appear without waiting for three real reports: inserts three tickets from the same environment (marked as demo
// data), which the stream processor counts into one alert. `npm run demo:cluster` adds them, `npm run demo:cluster -- --clean` removes them
// and the alert they produced.
import { COLLECTIONS, closeMongo, collection } from "../src/lib/mongo";

void COLLECTIONS;
const REPO = "boranfurkan/reproducer-hackathon-demo";

async function main() {
  const tickets = await collection<Record<string, unknown>>("tickets");
  if (process.argv.includes("--clean")) {
    const t = await tickets.deleteMany({ demo: true });
    const c = await (await collection<Record<string, unknown>>("ticket_clusters")).deleteMany({ "_id.repo": REPO, "_id.locale": "tr-TR", "_id.engine": "chromium" });
    console.log(`Removed ${t.deletedCount} demo tickets and ${c.deletedCount} alerts.`);
    return;
  }
  const now = Date.now();
  const people = ["demo-reporter-1", "demo-reporter-2", "demo-reporter-3"];
  await tickets.insertMany(
    people.map((userLogin, i) => ({
      demo: true,
      userLogin,
      repo: REPO,
      issueNumber: 1,
      title: "Category pages empty for some customers",
      createdAt: new Date(now - (people.length - i) * 20_000),
      environment: { engine: "chromium", locale: "tr-TR", timezoneId: "Europe/Istanbul", mobile: true },
    })),
  );
  console.log("Inserted 3 demo tickets from chromium / tr-TR. With the processor running, the alert appears within a few seconds.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeMongo);
