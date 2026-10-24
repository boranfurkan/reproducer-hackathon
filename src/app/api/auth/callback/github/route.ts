import { NextRequest, NextResponse } from 'next/server';
import { STATE_COOKIE, setSession } from '@/lib/auth';

// Step 2: GitHub sends the user back with a code. Check the state, exchange the code for a token, read the profile, start a session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/?error=${encodeURIComponent(reason)}`);

  if (!code || !state || !expected || state !== expected) return fail('login_state_mismatch');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.AUTH_GITHUB_ID,
      client_secret: process.env.AUTH_GITHUB_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/callback/github`,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) return fail(tokenJson.error ?? 'token_exchange_failed');

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: 'application/vnd.github+json' },
  });
  if (!userRes.ok) return fail('profile_failed');
  const user = (await userRes.json()) as { login: string; name: string | null; avatar_url: string };

  await setSession({ login: user.login, name: user.name, avatar: user.avatar_url, token: tokenJson.access_token });
  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
