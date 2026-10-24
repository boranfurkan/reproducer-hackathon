import { NextResponse } from 'next/server';
import { getSession, type Session } from './auth';

/** Returns the session, or a 401 response to send straight back. */
export async function requireSession(): Promise<{ session: Session } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Not logged in' }, { status: 401 }) };
  return { session };
}

/** GitHub errors carry a status; pass it on without leaking details. */
export function githubError(e: unknown): NextResponse {
  const status = (e as { status?: number }).status ?? 500;
  return NextResponse.json({ error: status === 404 ? 'Not found on GitHub' : 'GitHub request failed' }, { status: status >= 400 && status < 600 ? status : 500 });
}
