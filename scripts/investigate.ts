// Run one investigation from the terminal:
//   npm run investigate -- [issue number] [--notes "..."] [--deep] [--video <recording or screenshot>] [--env <environment id>] [--no-db]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { investigate } from "../src/lib/agent/investigate";
import { startRun } from "../src/lib/events";
import { uploadMedia } from "../src/lib/media";
import { closeMongo } from "../src/lib/mongo";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const issueNumber = Number(args.find((a) => /^\d+$/.test(a)) ?? 8);
const repo = { owner: "boranfurkan", name: "reproducer-hackathon-demo" };

async function main() {
  const t0 = Date.now();
  const stamp = () => `[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`;

  const { Octokit } = await import("octokit");
  // Optional: GITHUB_TOKEN raises the GitHub API limit from 60 to 5,000 requests per hour. Reads only.
  const githubToken = process.env.GITHUB_TOKEN || undefined;
  const octokit = new Octokit(githubToken ? { auth: githubToken } : {});
  const { data: issue } = await octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: issueNumber });

  let media;
  const videoPath = flag("--video");
  if (videoPath) {
    const ext = path.extname(videoPath).toLowerCase();
    const mime = ({ ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<string, string>)[ext];
    if (!mime) throw new Error(`Unsupported file type ${ext}`);
    media = [await uploadMedia(new Blob([readFileSync(videoPath)]), mime, path.basename(videoPath))];
    console.log(`Uploaded ${path.basename(videoPath)} (${media[0].kind})`);
  }
  const ticket = { repo, issueNumber, title: issue.title, body: issue.body ?? "", notes: flag("--notes") ?? "", media };
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
      { environmentId: flag("--env") ?? null, githubToken, deep: args.includes("--deep") },
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
