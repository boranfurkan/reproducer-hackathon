import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import type { RunDoc, RunEventDoc } from '@/lib/events';
import { collection } from '@/lib/mongo';

// The run and its timeline. The page polls this while the run is going.
export async function GET(_req: Request, ctx: RouteContext<'/api/runs/[id]'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Bad run id' }, { status: 400 });
  const runs = await collection<RunDoc>('runs');
  const run = await runs.findOne({ _id: new ObjectId(id), userLogin: auth.session.login });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  const events = await (await collection<RunEventDoc>('run_events')).find({ runId: run._id }).sort({ seq: 1, at: 1 }).toArray();
  return NextResponse.json({ run: { ...run, _id: String(run._id) }, events: events.map((e) => ({ ...e, _id: undefined, runId: String(e.runId) })) });
}
