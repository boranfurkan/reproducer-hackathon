import type { ObjectId } from "mongodb";
import { type RunDoc, appendEvent, thinkingWriter } from "./events";
import { TokenBudget } from "./gemini";
import { commentOnPr, listPrFeedback, pushToBranch, type PrFeedback } from "./github";
import { HARNESS_DIR, harnessFiles } from "./harness/scripts";
import type { BugMemoryDoc } from "./memory";
import { collection, mongoClient } from "./mongo";
import type { PrEventDoc } from "./prtrack";
import { redact } from "./redact";
import { askJson } from "./agent/argon";
import { withInitScripts } from "./harness/conditions";
import { type Revision, revisionSchema } from "./agent/schemas";
import { TEST_PATH, formatMatrix, parseMatrix, verifyFix } from "./agent/verify";
import { AntigravitySandbox } from "./sandbox/antigravity";
import type { SandboxFile } from "./types";
import { acquireWarm } from "./warm";

// Revising a pull request after review comments. The developer clicks "Address review feedback"; Argon continues the interaction that wrote the
// fix (server-side conversation state), writes a revision, the sandbox verifies it exactly like the first fix (red test, green tests, whole
// matrix), and the result waits for a second click. Only that click writes to GitHub: a commit on the pull request's branch and a short
// reply to the reviewer. Nothing is pushed before it.

const SYSTEM =
  "You are ReProducer, a senior engineer who reproduces bugs that only happen in the reporter's environment " +
  "(browser engine, locale, timezone, device, storage). Be precise. Never invent files or selectors that are not in the code you are given.";

const MAX_REVISIONS = 3;

export class ReviseError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

const describe = (f: PrFeedback) =>
  `- ${f.author} (${f.kind === "review" ? `review${f.state ? `: ${f.state.toLowerCase().replace("_", " ")}` : ""}` : f.kind === "inline" ? `inline comment on ${f.path}${f.line ? `:${f.line}` : ""}` : "comment"}): ${f.body.replace(/\s+/g, " ")}`;

/** Check the run, read the reviewers' words, mark the revision as running and do the work in the background. Returns at once. */
export async function startRevision(run: RunDoc, token: string): Promise<{ feedbackCount: number }> {
  if (!run.prNumber || !run.prBranch || !run.fixFiles?.length || !run.testContent || !run.replay) throw new ReviseError("This run has no pull request that can be revised.");
  if (run.prState === "merged" || run.prState === "closed") throw new ReviseError(`The pull request is already ${run.prState}.`);
  if (run.revision?.status === "running") throw new ReviseError("A revision is already running.");
  if ((run.revisions ?? 0) >= MAX_REVISIONS) throw new ReviseError(`That is ${MAX_REVISIONS} revisions of this pull request already.`);
  const [owner, repo] = run.repo.split("/");
  const feedback = await listPrFeedback(token, owner, repo, run.prNumber);
  if (!feedback.length) throw new ReviseError("There are no reviewer comments to address yet.");
  const text = redact(feedback.slice(0, 12).map(describe).join("\n"));
  await launchRevision(run, text, feedback.length);
  return { feedbackCount: feedback.length };
}

/** Mark the revision as running and do the work in the background (separate from startRevision so it can be driven with a given feedback text). */
export async function launchRevision(run: RunDoc, text: string, feedbackCount: number): Promise<void> {

  const runs = await collection<RunDoc>("runs");
  const claim = await runs.updateOne(
    { _id: run._id, "revision.status": { $ne: "running" } },
    { $set: { revision: { status: "running", requestedAt: new Date(), feedbackCount, feedback: text }, thinking: null } },
  );
  if (claim.modifiedCount !== 1) throw new ReviseError("A revision is already running.");
  await appendEvent(run, "revision", `Reading ${feedbackCount} reviewer comment${feedbackCount === 1 ? "" : "s"} on the pull request`);
  void work(run, text).catch(async (e) => {
    console.error("revision failed:", (e as Error).message);
    await fail(run._id, redact((e as Error).message).slice(0, 300));
    await appendEvent(run, "revision", `The revision failed: ${redact((e as Error).message).slice(0, 200)}`);
  });
}

async function fail(runId: ObjectId, reason: string): Promise<void> {
  await (await collection<RunDoc>("runs")).updateOne({ _id: runId }, { $set: { "revision.status": "failed", "revision.reason": reason, thinking: null } });
}

async function work(run: RunDoc, feedbackText: string): Promise<void> {
  const runs = await collection<RunDoc>("runs");
  const budget = new TokenBudget();
  const thinker = thinkingWriter(runs, run._id);
  const warm = await acquireWarm();
  const sandbox = new AntigravitySandbox(budget, warm.environmentId);
  sandbox.bootstrap = { files: harnessFiles(), cmd: `bash ${HARNESS_DIR}/boot.sh https://github.com/${run.repo}.git` };
  try {
    // The sandbox needs the repository (a warm one has it): boot is quick when everything is already there.
    const boot = await sandbox.runWith(harnessFiles(), `bash ${HARNESS_DIR}/boot.sh https://github.com/${run.repo}.git`, "boot");
    if (!boot.stdout.includes("BOOT_OK")) throw new Error(`Sandbox did not start: ${(boot.stdout + boot.stderr).slice(-300)}`);
    const replay = run.replay!;
    const job: SandboxFile = { path: `${HARNESS_DIR}/job.json`, content: JSON.stringify({ baseUrl: "http://localhost:3100", plan: replay.plan, profiles: replay.profiles.map(withInitScripts), engines: replay.engines }) };
    const required = new Set(replay.required);

    let interactionId = run.proposalInteractionId;
    let problem = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const current = `What the pull request contains now:\n${run.diff ?? ""}\n\nThe test that is in the pull request (${TEST_PATH}):\n${run.testContent}`;
      const turn = problem
        ? `Your revision failed verification:\n${problem}\nCorrect it and answer with the same JSON.`
        : `A reviewer commented on the pull request you proposed:\n${feedbackText}\n\n${current}\n\n` +
          "Revise the fix so it addresses what the reviewers asked for, without breaking the bug fix itself. " +
          "files: the COMPLETE set of files that differ from the base branch after your revision (include the files from the existing fix that stay changed), each with its full new content. " +
          `testContent: the full test file (${TEST_PATH}); keep it unchanged unless the review asks for a test change; it must still fail before the fix on the reporter profile and pass on the default profile. ` +
          "summary: one short sentence on what you changed. reply: two or three friendly sentences to the reviewer saying what you changed and why (plain text, no markdown headings).";
      const r = await askJson<Revision>({
        budget,
        system: SYSTEM,
        level: "high",
        schema: revisionSchema,
        prompt: turn,
        ...(interactionId ? { previousInteractionId: interactionId } : {}),
        onThought: (t) => thinker.think("Revising the fix", t),
        onInteractionId: (id) => (interactionId = id),
      }).finally(() => thinker.think("Revising the fix", null));
      await appendEvent(run, "revision", `Attempt ${attempt}: ${r.summary}`, { files: r.files.map((f) => f.path) }, budget.used);

      const v = await verifyFix({ sandbox, label: `revise-verify-${attempt}`, stage: `/opt/stage/${Date.now().toString(36)}-r${attempt}`, testContent: r.testContent || run.testContent!, files: r.files, job });
      const matrix = v.greenExit === 0 && v.matrixJson ? parseMatrix(v.matrixJson) : null;
      const passed = matrix?.filter((m) => required.has(m.name) && m.ok).length ?? 0;
      if (v.redOk && matrix && passed === required.size) {
        await appendEvent(run, "revision", `The revision is verified: the test fails before it and passes after it, ${passed} of ${required.size} required profiles pass`, undefined, budget.used);
        await runs.updateOne(
          { _id: run._id },
          { $set: { "revision.status": "ready", "revision.summary": r.summary, "revision.reply": redact(r.reply), "revision.files": r.files, "revision.testContent": r.testContent || run.testContent, "revision.diff": v.diff, "revision.matrixPassed": passed, "revision.matrixTotal": required.size, thinking: null } },
        );
        return;
      }
      problem = !v.redOk
        ? `The test must fail on the reporter profile and pass on the default profile before the fix (1 failed, 1 passed). Output:\n${v.red.slice(-1000)}`
        : matrix
          ? `Tests pass but required profiles still fail:\n${formatMatrix(matrix.filter((m) => required.has(m.name)))}`
          : `After the revision the tests still fail:\n${v.green.slice(-1000)}`;
    }
    await fail(run._id, "The revision could not be verified in two attempts. Nothing was changed.");
    await appendEvent(run, "revision", "The revision could not be verified in two attempts. Nothing was changed.", undefined, budget.used);
  } finally {
    thinker.cancel();
    warm.release(sandbox.environmentId);
  }
}

/** The second click: commit the verified revision to the pull request's branch and answer the reviewer. */
export async function pushRevision(run: RunDoc, token: string, login: string): Promise<{ commitUrl: string }> {
  const rev = run.revision;
  if (rev?.status !== "ready" || !rev.files?.length || !rev.testContent || !run.prBranch || !run.prNumber) throw new ReviseError("There is no verified revision to push.");
  if (run.prState === "merged" || run.prState === "closed") throw new ReviseError(`The pull request is already ${run.prState}.`);
  const runs = await collection<RunDoc>("runs");
  // Claim it first so a double click cannot push twice.
  const claim = await runs.updateOne({ _id: run._id, "revision.status": "ready" }, { $set: { "revision.status": "pushed", "revision.pushedAt": new Date() } });
  if (claim.modifiedCount !== 1) throw new ReviseError("Already being pushed.");
  const [owner, repo] = run.repo.split("/");
  try {
    const commit = await pushToBranch({ token, owner, repo, branch: run.prBranch, message: `Address review: ${rev.summary ?? "revise the fix"}`, files: [...rev.files, { path: TEST_PATH, content: rev.testContent }] });
    if (rev.reply) await commentOnPr(token, owner, repo, run.prNumber, rev.reply).catch((e) => console.error("PR comment failed:", (e as Error).message));
    // One transaction: the run now holds the revised fix, the history and the memory agree with it.
    const session = (await mongoClient()).startSession();
    try {
      await session.withTransaction(async () => {
        const at = new Date();
        await runs.updateOne({ _id: run._id }, { $set: { diff: rev.diff, fixFiles: rev.files, testContent: rev.testContent, "revision.commitUrl": commit.url, prCheckedAt: new Date(0) }, $inc: { revisions: 1 } }, { session });
        await (await collection<PrEventDoc>("pr_events")).insertOne({ runId: run._id, repo: run.repo, prNumber: run.prNumber!, at, kind: "revised", state: run.prState ?? "open", comments: run.prComments ?? 0, reviews: run.prReviews ?? 0 }, { session });
        if (rev.diff) await (await collection<BugMemoryDoc>("bug_memory")).updateOne({ runId: run._id }, { $set: { diff: redact(rev.diff) } }, { session });
        const events = await collection<{ runId: ObjectId; at: Date; seq: number; atMs: number; type: string; summary: string }>("run_events");
        await events.insertOne({ runId: run._id, at, seq: await events.countDocuments({ runId: run._id }, { session }), atMs: at.getTime() - run.createdAt.getTime(), type: "revision", summary: `Revision pushed to the pull request by ${login}: ${commit.url}` }, { session });
      });
    } finally {
      await session.endSession();
    }
    return { commitUrl: commit.url };
  } catch (e) {
    await runs.updateOne({ _id: run._id }, { $set: { "revision.status": "ready" }, $unset: { "revision.pushedAt": "" } });
    throw new ReviseError(`Could not push the revision: ${(e as Error).message.slice(0, 200)}`, 502);
  }
}

export async function discardRevision(run: RunDoc): Promise<void> {
  if (run.revision?.status !== "ready" && run.revision?.status !== "failed") throw new ReviseError("There is no revision to discard.");
  await (await collection<RunDoc>("runs")).updateOne({ _id: run._id }, { $set: { "revision.status": "discarded" } });
  await appendEvent(run, "revision", "The revision was discarded. Nothing was pushed.");
}

