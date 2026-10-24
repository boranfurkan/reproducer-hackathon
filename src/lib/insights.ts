import type { RunDoc } from "./events";
import { collection } from "./mongo";

// Insights: what ReProducer has done for one developer, computed by MongoDB aggregation pipelines over `runs`, `pr_events` and `bug_memory`.
//   - per day: runs, fixes, tokens, with a running total ($group, $setWindowFields)
//   - per status and what the average run costs ($group, $avg)
//   - per isolating variable: how many fixes and how many were merged ($group, $cond)
//   - pull requests with their review activity ($lookup into pr_events)

export interface Insights {
  totals: { runs: number; fixed: number; tokens: number; avgTokensPerFix: number; avgSecondsPerFix: number; pullRequests: number; merged: number; closed: number };
  daily: { day: string; runs: number; fixed: number; tokens: number; tokensTotal: number }[];
  byStatus: { status: string; runs: number; avgTokens: number }[];
  byVariable: { variable: string; fixes: number; merged: number }[];
  pullRequests: { run: string; title: string; prNumber: number; state: string; events: number; reviews: number; revised: boolean }[];
}

export async function insightsFor(login: string): Promise<Insights> {
  const runs = await collection<RunDoc>("runs");
  const mine = { $match: { userLogin: login } };

  const [daily, byStatus, byVariable, prs, totals] = await Promise.all([
    runs
      .aggregate([
        mine,
        { $group: { _id: { $dateTrunc: { date: "$createdAt", unit: "day" } }, runs: { $sum: 1 }, fixed: { $sum: { $cond: [{ $eq: ["$status", "fixed"] }, 1, 0] } }, tokens: { $sum: { $ifNull: ["$tokensUsed", 0] } } } },
        { $setWindowFields: { sortBy: { _id: 1 }, output: { tokensTotal: { $sum: "$tokens", window: { documents: ["unbounded", "current"] } } } } },
        { $sort: { _id: -1 } },
        { $limit: 14 },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    runs.aggregate([mine, { $group: { _id: "$status", runs: { $sum: 1 }, avgTokens: { $avg: { $ifNull: ["$tokensUsed", 0] } } } }, { $sort: { runs: -1 } }]).toArray(),
    runs
      .aggregate([
        { $match: { userLogin: login, status: "fixed", decisiveVariables: { $exists: true, $ne: [] } } },
        { $group: { _id: { $arrayElemAt: ["$decisiveVariables", 0] }, fixes: { $sum: 1 }, merged: { $sum: { $cond: [{ $eq: ["$prState", "merged"] }, 1, 0] } } } },
        { $sort: { fixes: -1 } },
        { $limit: 8 },
      ])
      .toArray(),
    runs
      .aggregate([
        { $match: { userLogin: login, prNumber: { $exists: true } } },
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
        { $lookup: { from: "pr_events", localField: "_id", foreignField: "runId", as: "events" } },
        { $project: { repo: 1, issueNumber: 1, title: 1, prNumber: 1, prState: 1, prReviews: 1, events: { $size: "$events" }, revised: { $in: ["revised", "$events.kind"] } } },
      ])
      .toArray(),
    runs
      .aggregate([
        mine,
        {
          $group: {
            _id: null,
            runs: { $sum: 1 },
            fixed: { $sum: { $cond: [{ $eq: ["$status", "fixed"] }, 1, 0] } },
            tokens: { $sum: { $ifNull: ["$tokensUsed", 0] } },
            fixTokens: { $sum: { $cond: [{ $eq: ["$status", "fixed"] }, { $ifNull: ["$tokensUsed", 0] }, 0] } },
            fixMs: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "fixed"] }, "$finishedAt"] }, { $subtract: ["$finishedAt", "$createdAt"] }, 0] } },
            pullRequests: { $sum: { $cond: [{ $ifNull: ["$prNumber", false] }, 1, 0] } },
            merged: { $sum: { $cond: [{ $eq: ["$prState", "merged"] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ["$prState", "closed"] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
  ]);

  const t = totals[0] ?? { runs: 0, fixed: 0, tokens: 0, fixTokens: 0, fixMs: 0, pullRequests: 0, merged: 0, closed: 0 };
  return {
    totals: { runs: t.runs, fixed: t.fixed, tokens: t.tokens, avgTokensPerFix: t.fixed ? Math.round(t.fixTokens / t.fixed) : 0, avgSecondsPerFix: t.fixed ? Math.round(t.fixMs / t.fixed / 1000) : 0, pullRequests: t.pullRequests, merged: t.merged, closed: t.closed },
    daily: daily.map((d) => ({ day: new Date(d._id).toISOString().slice(0, 10), runs: d.runs, fixed: d.fixed, tokens: d.tokens, tokensTotal: d.tokensTotal })),
    byStatus: byStatus.map((s) => ({ status: String(s._id), runs: s.runs, avgTokens: Math.round(s.avgTokens) })),
    byVariable: byVariable.map((v) => ({ variable: String(v._id), fixes: v.fixes, merged: v.merged })),
    pullRequests: prs.map((p) => ({ run: `${String(p.repo).split("/")[1]}#${p.issueNumber}`, title: p.title, prNumber: p.prNumber, state: p.prState ?? "open", events: p.events, reviews: p.prReviews ?? 0, revised: Boolean(p.revised) })),
  };
}
