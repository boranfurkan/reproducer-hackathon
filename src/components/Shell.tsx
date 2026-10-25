'use client';

import type { ReactNode } from 'react';
import Header from './Header';
import { IconGitHub } from './icons';
import { PageLoader } from './loaders';
import Mascot from './mascot/Mascot';
import SiteFooter from './SiteFooter';
import { Panel, buttonClass } from './ui';
import type { SessionUser } from '@/lib/client';
import { useSession } from '@/lib/hooks';

/** Page frame: header, footer and a "log in first" screen for pages that need a session. Content has the header's width and side padding, so
 * every page lines up with the navigation bar. */
export default function Shell({ children }: { children: (user: SessionUser) => ReactNode }) {
  const user = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user ?? null} />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-16 sm:px-8 sm:pt-10">
        {user === undefined ? (
          <PageLoader label="Checking your session" />
        ) : user ? (
          children(user)
        ) : (
          <Panel className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-12 text-center">
            <Mascot pose="idle" size={112} />
            <h1 className="font-mono text-xl font-semibold">Log in to continue</h1>
            <p className="text-sm text-muted">ReProducer reads your repositories&apos; issues and opens a pull request only after you approve.</p>
            <a href="/api/auth/login" className={`${buttonClass('primary', 'md')} no-underline`}><IconGitHub />Log in with GitHub</a>
          </Panel>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
