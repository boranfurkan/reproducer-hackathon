import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import { draftReporterReply } from '@/lib/agent/reply';
import { appendEvent, type RunDoc } from '@/lib/events';
import { commentOnIssue } from '@/lib/github';
import { collection } from '@/lib/mongo';

// A reply to the reporter when a bug could not be reproduced.
//   draft  Flash writes it from what the investigation found (nothing is posted)
//   post   comments on the GitHub issue with the (edited) text: the developer's click is the approval
export async function POST(request: Request, ctx: RouteContext<'/api/runs/[id]/reply'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Bad run id' }, { status: 400 });
  const { action, text } = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string; text?: string };
  const runs = await collection<RunDoc>('runs');
  const run = await runs.findOne({ _id: new ObjectId(id), userLogin: auth.session.login });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  if (run.status === 'running' || run.status === 'fixed') return NextResponse.json({ error: 'This run has no unresolved report to reply to.' }, { status: 409 });

  if (action === 'draft') {
    const draft = await draftReporterReply(run);
    await runs.updateOne({ _id: run._id }, { $set: { replyDraft: { text: draft } } });
    return NextResponse.json({ text: draft });
  }
  if (action === 'post') {
    const body = String(text ?? '').trim().slice(0, 4000);
    if (body.length < 10) return NextResponse.json({ error: 'The reply is empty.' }, { status: 400 });
    if (run.replyDraft?.postedAt) return NextResponse.json({ error: 'The reply was already posted.', url: run.replyDraft.url }, { status: 409 });
    const claim = await runs.updateOne({ _id: run._id, 'replyDraft.postedAt': { $exists: false } }, { $set: { 'replyDraft.text': body, 'replyDraft.postedAt': new Date() } });
    if (claim.matchedCount !== 1) return NextResponse.json({ error: 'The reply was already posted.' }, { status: 409 });
    try {
      const [owner, repo] = run.repo.split('/');
      const { url } = await commentOnIssue(auth.session.token, owner, repo, run.issueNumber, body);
      await runs.updateOne({ _id: run._id }, { $set: { 'replyDraft.url': url } });
      await appendEvent(run, 'revision', `Reply posted on the issue by ${auth.session.login}: ${url}`);
      return NextResponse.json({ url });
    } catch (e) {
      await runs.updateOne({ _id: run._id }, { $unset: { 'replyDraft.postedAt': '' } });
      return NextResponse.json({ error: `Could not post the reply: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
    }
  }
  return NextResponse.json({ error: 'action must be draft or post' }, { status: 400 });
}
