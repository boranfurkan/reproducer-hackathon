import { NextResponse } from 'next/server';
import { githubError, requireSession } from '@/lib/api';
import { triageIssues } from '@/lib/agent/triage';
import { listIssues } from '@/lib/github';

// Badges for the issue list: which open issues look environment-specific, and which look like a fix already in memory.
export async function GET(_req: Request, ctx: RouteContext<'/api/repos/[owner]/[name]/triage'>) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { owner, name } = await ctx.params;
  try {
    const issues = await listIssues(auth.session.token, owner, name);
    return NextResponse.json({ triage: await triageIssues(`${owner}/${name}`, issues) });
  } catch (e) {
    return githubError(e);
  }
}
