import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import type { RunDoc, RunEventDoc } from '@/lib/events';
import { similarFixes } from '@/lib/memory';
import { collection } from '@/lib/mongo';
import { syncPr } from '@/lib/prtrack';

// The run and its timeline. The page polls this while the run is going.
export async function GET(_req: Request, ctx: RouteContext<'/api/runs/[id]'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Bad run id' }, { status: 400 });
  const runs = await collection<RunDoc>('runs');
  const run = await runs.findOne({ _id: new ObjectId(id), userLogin: auth.session.login });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  // Keep the pull request up to date (reviews, merged, closed) while somebody is looking at the run.
  if (run.prNumber && (await syncPr(run, auth.session.token))) Object.assign(run, await runs.findOne({ _id: run._id }));
  // A run that is still "running" long after it started lost its server process (a restart): say so instead of spinning forever.
  // A deep investigation alone may take 32 minutes, so the limit leaves room for the matrix, the fix and its verification.
  if (run.status === 'running' && Date.now() - run.createdAt.getTime() > 60 * 60_000) {
    run.status = 'failed';
    run.reason = 'The investigation was interrupted (the server restarted). Start it again.';
    await runs.updateOne({ _id: run._id, status: 'running' }, { $set: { status: 'failed', reason: run.reason, finishedAt: new Date() } });
  }
  const events = await (await collection<RunEventDoc>('run_events')).find({ runId: run._id }).sort({ seq: 1, at: 1 }).toArray();
  // Past fixes whose code change looks like this one (voyage-code-4 embeddings), shown on the approval card.
  const similar = run.status === 'fixed' && run.diff ? await similarFixes(run.diff, 3, String(run._id)) : [];
  return NextResponse.json({ similar, run: { ...run, _id: String(run._id) }, events: events.map((e) => ({ ...e, _id: undefined, runId: String(e.runId) })) });
}
