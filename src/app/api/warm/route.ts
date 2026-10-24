import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import { warmUp } from '@/lib/warm';

// Called when the ticket form opens: start installing Playwright and cloning the repository so the sandbox is ready by the time
// the developer clicks Investigate. Cheap to call repeatedly: it does nothing while a warm sandbox exists or one is being prepared.
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { owner?: string; name?: string } | null;
  // Same shape GitHub allows for owners and repository names; anything else is refused before it reaches a shell command.
  const ok = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(v);
  if (!body || !ok(body.owner) || !ok(body.name)) return NextResponse.json({ error: 'owner and name are required' }, { status: 400 });
  return NextResponse.json({ state: warmUp(`https://github.com/${body.owner}/${body.name}.git`) });
}
