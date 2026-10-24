import { NextResponse } from 'next/server';
import { githubError, requireSession } from '@/lib/api';
import { listIssues } from '@/lib/github';

export async function GET(_req: Request, ctx: RouteContext<'/api/repos/[owner]/[name]/issues'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { owner, name } = await ctx.params;
  try {
    return NextResponse.json({ issues: await listIssues(auth.session.token, owner, name) });
  } catch (e) {
    return githubError(e);
  }
}
