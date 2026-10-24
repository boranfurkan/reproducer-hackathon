'use client';

import type { ReactNode } from 'react';
import Header from './Header';
import { useSession } from '@/lib/hooks';
import { Card } from './ui';

/** Page frame: header plus a "log in first" screen for pages that need a session. */
export default function Shell({ children }: { children: (login: string) => ReactNode }) {
  const user = useSession();
  return (
    <>
      <Header user={user ?? null} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {user === undefined ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : user ? (
          children(user.login)
        ) : (
          <Card>
            <h1 className="text-xl font-semibold">Log in to continue</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">ReProducer reads your repositories&apos; issues and opens pull requests for you, only after you approve.</p>
            <a href="/api/auth/login" className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">Continue with GitHub</a>
          </Card>
        )}
      </main>
    </>
  );
}
