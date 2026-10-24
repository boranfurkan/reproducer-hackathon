import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

// Never returns the token: the browser only learns who is logged in.
export async function GET() {
  const s = await getSession();
  return NextResponse.json({ user: s ? { login: s.login, name: s.name, avatar: s.avatar } : null });
}
