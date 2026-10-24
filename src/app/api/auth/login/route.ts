import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { STATE_COOKIE } from '@/lib/auth';

// Step 1 of GitHub OAuth: remember a random state in a short-lived cookie and send the browser to GitHub.
export async function GET(request: NextRequest) {
  const clientId = process.env.AUTH_GITHUB_ID;
  if (!clientId) return NextResponse.json({ error: 'AUTH_GITHUB_ID is not set' }, { status: 500 });
  const state = randomBytes(16).toString('hex');
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${request.nextUrl.origin}/api/auth/callback/github`);
  // repo: read issues and open pull requests. Private repositories are not supported by the sandbox yet.
  url.searchParams.set('scope', 'repo read:user');
  url.searchParams.set('state', state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  return res;
}
