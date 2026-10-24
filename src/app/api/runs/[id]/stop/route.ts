import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import type { RunDoc } from '@/lib/events';
import { collection } from '@/lib/mongo';

// Asks a running investigation to stop. It checks the flag between steps, so it ends after the step it is in (up to about two minutes).
export async function POST(_req: Request, ctx: RouteContext<'/api/runs/[id]/stop'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Bad run id' }, { status: 400 });
  const runs = await collection<RunDoc>('runs');
  const res = await runs.updateOne({ _id: new ObjectId(id), userLogin: auth.session.login, status: 'running' }, { $set: { stopRequested: true } });
  return res.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Run not found or already finished' }, { status: 404 });
}
