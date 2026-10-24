import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import { insightsFor } from '@/lib/insights';

export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json(await insightsFor(auth.session.login));
  } catch (e) {
    return NextResponse.json({ error: `Could not compute insights: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
