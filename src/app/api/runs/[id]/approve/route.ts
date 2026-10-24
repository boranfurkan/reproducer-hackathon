import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import { buildPrBody, pullRequestTitle } from '@/lib/agent/pr';
import type { ApprovalDoc, RunDoc, RunEventDoc } from '@/lib/events';
import { openFixPullRequest } from '@/lib/github';
import { collection, mongoClient } from '@/lib/mongo';
import type { PrEventDoc } from '@/lib/prtrack';

// The approval gate: nothing is pushed to GitHub until the developer clicks this.
export async function POST(_req: Request, ctx: RouteContext<'/api/runs/[id]/approve'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Bad run id' }, { status: 400 });

  const runs = await collection<RunDoc>('runs');
  const run = await runs.findOne({ _id: new ObjectId(id), userLogin: auth.session.login });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  if (run.status !== 'fixed' || !run.fixFiles?.length || !run.testContent) {
    return NextResponse.json({ error: 'This run has no verified fix to submit' }, { status: 409 });
  }
  if (run.prUrl) return NextResponse.json({ error: 'A pull request was already opened', prUrl: run.prUrl }, { status: 409 });

  // Claim the run first so a double click cannot open two pull requests.
  const claim = await runs.updateOne({ _id: run._id, prUrl: { $exists: false }, approvedAt: { $exists: false } }, { $set: { approvedAt: new Date() } });
  if (claim.modifiedCount !== 1) return NextResponse.json({ error: 'Already being approved' }, { status: 409 });

  const [owner, repo] = run.repo.split('/');
  const issueNumber = run.issueNumber;
  try {
    const pr = await openFixPullRequest({
      token: auth.session.token,
      owner,
      repo,
      issueNumber,
      title: pullRequestTitle(run),
      body: await buildPrBody(run, issueNumber),
      files: [...run.fixFiles, { path: 'tests/repro.spec.js', content: run.testContent }],
    });
    // The approval, the run, the timeline entry and the PR history are one transaction: they are all written or none is.
    const session = (await mongoClient()).startSession();
    try {
      await session.withTransaction(async () => {
        const at = new Date();
        const events = await collection<RunEventDoc>('run_events');
        await runs.updateOne({ _id: run._id }, { $set: { prUrl: pr.url, prNumber: pr.number, prBranch: pr.branch, prState: 'open', prCheckedAt: at, prComments: 0, prReviews: 0 } }, { session });
        await (await collection<ApprovalDoc>('approvals')).insertOne({ runId: run._id, login: auth.session.login, at, prUrl: pr.url, branch: pr.branch }, { session });
        await events.insertOne(
          { runId: run._id, at, seq: await events.countDocuments({ runId: run._id }, { session }), atMs: at.getTime() - run.createdAt.getTime(), type: 'pr_opened', summary: `Pull request #${pr.number} opened: ${pr.url}` },
          { session },
        );
        await (await collection<PrEventDoc>('pr_events')).insertOne({ runId: run._id, repo: run.repo, prNumber: pr.number, at, kind: 'opened', state: 'open', comments: 0, reviews: 0 }, { session });
      });
    } catch (e) {
      // The pull request exists on GitHub, so the developer must not lose the link: record the essentials without the transaction.
      console.error('approval transaction failed:', (e as Error).message);
      await runs.updateOne({ _id: run._id }, { $set: { prUrl: pr.url, prNumber: pr.number, prBranch: pr.branch, prState: 'open' } });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ prUrl: pr.url, number: pr.number });
  } catch (e) {
    await runs.updateOne({ _id: run._id }, { $unset: { approvedAt: '' } });
    return NextResponse.json({ error: `Could not open the pull request: ${(e as Error).message.slice(0, 200)}` }, { status: 502 });
  }
}
