import { NextResponse } from 'next/server';
import { githubError, requireSession } from '@/lib/api';
import { listRepos } from '@/lib/github';

export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ repos: await listRepos(auth.session.token) });
  } catch (e) {
    return githubError(e);
  }
}
