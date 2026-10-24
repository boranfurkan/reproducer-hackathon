'use client';

import type { ReactNode } from 'react';
import Header from './Header';
import Mascot from './mascot/Mascot';
import SiteFooter from './SiteFooter';
import { Panel, buttonClass } from './ui';
import type { SessionUser } from '@/lib/client';
import { useSession } from '@/lib/hooks';

/** Page frame: header, footer and a "log in first" screen for pages that need a session. `maxWidth` is the content width in px. */
export default function Shell({ children, maxWidth = 1120 }: { children: (user: SessionUser) => ReactNode; maxWidth?: number }) {
  const user = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user ?? null} />
      <main className="mx-auto w-full flex-1 px-4 pt-6 pb-16 sm:px-8 sm:pt-10" style={{ maxWidth }}>
        {user === undefined ? (
          <p className="font-mono text-sm text-subtle">Loading…</p>
        ) : user ? (
          children(user)
        ) : (
          <Panel className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-12 text-center">
            <Mascot pose="idle" size={112} />
            <h1 className="font-mono text-xl font-semibold">Log in to continue</h1>
            <p className="text-sm text-muted">ReProducer reads your repositories&apos; issues and opens a pull request only after you approve.</p>
            <a href="/api/auth/login" className={`${buttonClass('primary', 'md')} no-underline`}>Log in with GitHub</a>
          </Panel>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
