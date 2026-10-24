import { NextRequest, NextResponse } from 'next/server';
import { githubError, requireSession } from '@/lib/api';
import { collection } from '@/lib/mongo';
import type { RunDoc } from '@/lib/events';
import { startInvestigation } from '@/lib/runner';

// POST: start an investigation (returns at once, the run continues in the background).
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    owner?: string; name?: string; issueNumber?: number; notes?: string; envVars?: Record<string, string>;
  } | null;
  if (!body?.owner || !body.name || !Number.isInteger(body.issueNumber)) {
    return NextResponse.json({ error: 'owner, name and issueNumber are required' }, { status: 400 });
  }
  // Env vars: keep only plain string pairs with sane names. They go to the sandbox only.
  const envVars = Object.fromEntries(
    Object.entries(body.envVars ?? {}).filter(([k, v]) => /^[A-Z_][A-Z0-9_]*$/i.test(k) && typeof v === 'string' && v.length > 0),
  );
  try {
    const runId = await startInvestigation({
      token: auth.session.token,
      login: auth.session.login,
      owner: body.owner,
      name: body.name,
      issueNumber: body.issueNumber as number,
      notes: String(body.notes ?? '').slice(0, 4000),
      envVars,
    });
    return NextResponse.json({ runId }, { status: 202 });
  } catch (e) {
    return githubError(e);
  }
}

// GET: the signed-in user's recent runs.
export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const runs = await collection<RunDoc>('runs');
  const docs = await runs
    .find({ userLogin: auth.session.login }, { projection: { diff: 0, testContent: 0, fixFiles: 0, sandboxCalls: 0 } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return NextResponse.json({ runs: docs.map((d) => ({ ...d, _id: String(d._id) })) });
}
