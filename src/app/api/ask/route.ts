import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import { askMemory } from '@/lib/agent/ask';

// A few questions per user per hour: each one is a handful of model calls (the hackathon account is monitored for abuse).
const asked = new Map<string, number[]>();

export async function POST(request: Request) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = String(body?.question ?? '').trim().slice(0, 400);
  if (question.length < 3) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  const now = Date.now();
  const recent = (asked.get(auth.session.login) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 20) return NextResponse.json({ error: 'That is 20 questions in the last hour. Try again later.' }, { status: 429 });
  asked.set(auth.session.login, [...recent, now]);
  try {
    return NextResponse.json(await askMemory(question, auth.session.login));
  } catch (e) {
    return NextResponse.json({ error: `Could not answer: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
