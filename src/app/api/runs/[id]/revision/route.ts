import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import type { RunDoc } from '@/lib/events';
import { collection } from '@/lib/mongo';
import { ReviseError, discardRevision, pushRevision, startRevision } from '@/lib/revise';

// Revising the pull request after review comments. Three actions, each its own click:
//   start   read the reviewers' comments and write a verified revision (nothing is pushed)
//   push    commit the verified revision to the pull request's branch and answer the reviewer (the approval)
//   discard drop the revision
export async function POST(request: Request, ctx: RouteContext<'/api/runs/[id]/revision'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Bad run id' }, { status: 400 });
  const { action } = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string };
  const run = await (await collection<RunDoc>('runs')).findOne({ _id: new ObjectId(id), userLogin: auth.session.login });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  try {
    if (action === 'start') return NextResponse.json(await startRevision(run, auth.session.token), { status: 202 });
    if (action === 'push') return NextResponse.json(await pushRevision(run, auth.session.token, auth.session.login));
    if (action === 'discard') {
      await discardRevision(run);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'action must be start, push or discard' }, { status: 400 });
  } catch (e) {
    if (e instanceof ReviseError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: `Revision failed: ${(e as Error).message.slice(0, 200)}` }, { status: 502 });
  }
}
