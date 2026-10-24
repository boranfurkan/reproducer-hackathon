// Run one investigation from the terminal: npm run investigate -- [issue number] [--notes "..."] [--env <environment id>] [--no-db]
import { mkdirSync, writeFileSync } from "node:fs";
import { investigate } from "../src/lib/agent/investigate";
import { startRun } from "../src/lib/events";
import { closeMongo } from "../src/lib/mongo";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const issueNumber = Number(args.find((a) => /^\d+$/.test(a)) ?? 1);
const repo = { owner: "boranfurkan", name: "reproducer-hackathon-demo" };

async function main() {
  const t0 = Date.now();
  const stamp = () => `[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`;

  const { Octokit } = await import("octokit");
  const octokit = new Octokit();
  const { data: issue } = await octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: issueNumber });

  const ticket = { repo, issueNumber, title: issue.title, body: issue.body ?? "", notes: flag("--notes") ?? "" };
  const record = args.includes("--no-db") ? null : await startRun(ticket);
  if (record) console.log(`Run ${record.runId} (events are stored in MongoDB)`);

  let result;
  try {
    result = await investigate(
      ticket,
      (type, summary, data) => {
        console.log(`${stamp()} ${type.toUpperCase().padEnd(18)} ${summary}`);
        record?.emit(type, summary, data);
      },
      { environmentId: flag("--env") ?? null },
    );
  } catch (e) {
    await record?.fail(e);
    await closeMongo();
    throw e;
  }
  await record?.finish(result);
  await closeMongo();

  console.log(`\nStatus: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
  console.log(`Tokens used: ${result.tokensUsed} | sandbox environment: ${result.environmentId}`);
  console.log("Sandbox calls: " + result.sandboxCalls.map((c) => `${c.label} ${Math.round(c.ms / 1000)}s`).join(", "));
  if (result.diff) console.log(`\n${result.diff}`);

  mkdirSync(".runs", { recursive: true });
  const file = `.runs/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`\nFull result: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
