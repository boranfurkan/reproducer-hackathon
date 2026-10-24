import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import type { Document } from 'mongodb';
import { collection } from '@/lib/mongo';

// Alerts written by the Atlas Stream Processing job: several reports from the same environment in a short window.
// Empty until the processor is running (see docs/STREAM-PROCESSING.md).
export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const col = await collection<Document>('ticket_clusters');
  const docs = await col.find({}).sort({ 'lastAt': -1 }).limit(5).toArray();
  return NextResponse.json({
    clusters: docs.map((d) => {
      const id = (typeof d._id === 'object' && d._id ? d._id : {}) as { repo?: string; engine?: string; locale?: string };
      return {
        repo: id.repo,
        engine: id.engine,
        locale: id.locale,
        count: Number(d.count ?? 0),
        users: Number(d.users ?? 0),
        lastAt: d.lastAt ?? d._stream_meta?.window?.end ?? null,
      };
    }),
  });
}
