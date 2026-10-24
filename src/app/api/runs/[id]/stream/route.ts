import { ObjectId } from 'mongodb';
import { requireSession } from '@/lib/api';
import type { RunDoc } from '@/lib/events';
import { collection, db } from '@/lib/mongo';

// Live updates for the run page: a MongoDB change stream on this run (its document, its timeline events, its pull request history),
// forwarded as server-sent events. A message only says "something changed": the page then reloads the run, so it never trusts a partial copy.
export async function GET(req: Request, ctx: RouteContext<'/api/runs/[id]/stream'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return new Response('Bad run id', { status: 400 });
  const runId = new ObjectId(id);
  const mine = await (await collection<RunDoc>('runs')).findOne({ _id: runId, userLogin: auth.session.login }, { projection: { _id: 1 } });
  if (!mine) return new Response('Run not found', { status: 404 });

  const changes = (await db()).watch([
    { $match: { $or: [{ 'ns.coll': 'runs', 'documentKey._id': runId }, { 'ns.coll': 'run_events', 'fullDocument.runId': runId }, { 'ns.coll': 'pr_events', 'fullDocument.runId': runId }] } },
  ]);
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const close = (controller?: ReadableStreamDefaultController) => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    void changes.close().catch(() => undefined);
    try {
      controller?.close();
    } catch {
      /* already closed */
    }
  };

  const body = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      send('retry: 3000\n\n');
      changes.on('change', (c) => send(`data: ${JSON.stringify({ c: (c as { ns?: { coll?: string } }).ns?.coll ?? '' })}\n\n`));
      changes.on('error', () => {
        send('event: closed\ndata: {}\n\n');
        close(controller);
      });
      // A comment line every 15 s keeps proxies from closing an idle connection.
      heartbeat = setInterval(() => send(': ping\n\n'), 15_000);
      req.signal.addEventListener('abort', () => close(controller));
    },
    cancel() {
      close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
