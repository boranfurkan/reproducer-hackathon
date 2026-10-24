import type { ObjectId } from "mongodb";
import type { RunDoc, RunEventDoc } from "./events";
import { octokitFor } from "./github";
import type { BugMemoryDoc } from "./memory";
import { collection, mongoClient } from "./mongo";

// Pull request tracking: after the developer approves, ReProducer keeps watching what happens to the pull request (reviews, merged, closed)
// and records it. A change is written in ONE transaction across `runs`, `pr_events`, `run_events` and `bug_memory`, so the page, the audit
// trail and the memory can never disagree. The memory learns from the outcome: merged fixes rank higher in recall, closed ones lower.

export type PrState = "open" | "merged" | "closed";

export interface PrSnapshot {
  state: PrState;
  mergedAt?: Date;
  closedAt?: Date;
  /** Conversation comments plus inline review comments. */
  comments: number;
  /** Reviews submitted, and the latest review verdict (APPROVED, CHANGES_REQUESTED, COMMENTED). */
  reviews: number;
  reviewState?: string;
}

export interface PrEventDoc {
  runId: ObjectId;
  repo: string;
  prNumber: number;
  at: Date;
  kind: "opened" | "review" | "revised" | "merged" | "closed" | "reopened";
  state: PrState;
  comments: number;
  reviews: number;
  reviewState?: string;
}

/** Read the pull request from GitHub (read-only calls). */
export async function fetchPr(token: string, owner: string, repo: string, number: number): Promise<PrSnapshot> {
  const gh = (await octokitFor(token)).rest;
  const [{ data: pr }, { data: reviews }] = await Promise.all([gh.pulls.get({ owner, repo, pull_number: number }), gh.pulls.listReviews({ owner, repo, pull_number: number, per_page: 50 })]);
  const submitted = reviews.filter((r) => r.state !== "PENDING");
  return {
    state: pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open",
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
    closedAt: pr.closed_at ? new Date(pr.closed_at) : undefined,
    comments: (pr.comments ?? 0) + (pr.review_comments ?? 0),
    reviews: submitted.length,
    reviewState: submitted.at(-1)?.state,
  };
}

const kindOf = (run: Pick<RunDoc, "prState" | "prReviews" | "prComments">, s: PrSnapshot): PrEventDoc["kind"] | null => {
  const before = run.prState ?? "open";
  if (s.state !== before) return s.state === "open" ? "reopened" : s.state;
  if (s.reviews !== (run.prReviews ?? 0) || s.comments !== (run.prComments ?? 0)) return "review";
  return null;
};

const words: Record<PrEventDoc["kind"], string> = {
  opened: "Pull request opened",
  review: "New review activity on the pull request",
  revised: "Revision pushed to the pull request",
  merged: "Pull request merged",
  closed: "Pull request closed without merging",
  reopened: "Pull request reopened",
};

/**
 * Compare the pull request with what was last recorded and write any change in one transaction. Returns what changed (null: nothing).
 * Cheap to call: a recent check is skipped, and a merged or closed pull request is final.
 */
export async function syncPr(run: RunDoc, token: string, minAgeMs = 45_000): Promise<PrEventDoc["kind"] | null> {
  if (!run.prNumber || run.prState === "merged") return null;
  if (run.prCheckedAt && Date.now() - run.prCheckedAt.getTime() < minAgeMs) return null;
  const [owner, repo] = run.repo.split("/");
  let snapshot: PrSnapshot;
  try {
    snapshot = await fetchPr(token, owner, repo, run.prNumber);
  } catch (e) {
    console.error("fetchPr failed:", (e as Error).message);
    return null;
  }
  const runs = await collection<RunDoc>("runs");
  const kind = kindOf(run, snapshot);
  if (!kind) {
    await runs.updateOne({ _id: run._id }, { $set: { prCheckedAt: new Date() } });
    return null;
  }

  const client = await mongoClient();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const at = new Date();
      const events = await collection<RunEventDoc>("run_events");
      await runs.updateOne(
        { _id: run._id },
        { $set: { prState: snapshot.state, prCheckedAt: at, prComments: snapshot.comments, prReviews: snapshot.reviews, prReviewState: snapshot.reviewState ?? null, ...(snapshot.mergedAt ? { prMergedAt: snapshot.mergedAt } : {}), ...(snapshot.state === "closed" && snapshot.closedAt ? { prClosedAt: snapshot.closedAt } : {}) } },
        { session },
      );
      await (await collection<PrEventDoc>("pr_events")).insertOne({ runId: run._id, repo: run.repo, prNumber: run.prNumber!, at, kind, state: snapshot.state, comments: snapshot.comments, reviews: snapshot.reviews, reviewState: snapshot.reviewState }, { session });
      await events.insertOne(
        { runId: run._id, at, seq: await events.countDocuments({ runId: run._id }, { session }), atMs: at.getTime() - run.createdAt.getTime(), type: "pr_update", summary: `${words[kind]} (#${run.prNumber})` },
        { session },
      );
      // The memory learns what the reviewers decided.
      if (snapshot.state !== (run.prState ?? "open")) {
        await (await collection<BugMemoryDoc>("bug_memory")).updateOne({ runId: run._id }, { $set: { outcome: snapshot.state } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
  return kind;
}
