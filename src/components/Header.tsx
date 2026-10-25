'use client';

import Link from 'next/link';
import { IconChart, IconGitHub, IconLogOut } from './icons';
import Mascot from './mascot/Mascot';
import { UserTile, buttonClass } from './ui';
import { initials, type SessionUser } from '@/lib/client';
import { logout as endSession } from '@/lib/hooks';

export default function Header({ user }: { user: SessionUser | null }) {
  async function logout() {
    await endSession();
    // Reload: the session state lives in client components, and every page shows a login prompt when logged out.
    window.location.reload();
  }
  return (
    <header className="border-b border-purple-800 bg-purple-950">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-foreground no-underline">
          <Mascot avatar size={32} label="" />
          <span className="font-mono text-base font-semibold tracking-tight">ReProducer</span>
        </Link>
        {user ? (
          <div className="flex items-center gap-3 font-mono text-[13px] font-medium text-muted">
            {/* On a phone the labels give way to the icons, so the bar fits. */}
            <Link href="/insights" data-tour="nav-insights" aria-label="Insights" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted no-underline transition-colors hover:bg-purple-850 hover:text-foreground"><IconChart size={14} /><span className="hidden sm:inline">Insights</span></Link>
            <UserTile letters={initials(user.name, user.login)} />
            <span className="hidden max-w-[30vw] truncate sm:inline">{user.login}</span>
            <button onClick={logout} aria-label="Log out" className={buttonClass('secondary', 'sm')}><IconLogOut size={14} /><span className="hidden sm:inline">Log out</span></button>
          </div>
        ) : (
          <a href="/api/auth/login" className={`${buttonClass('primary', 'sm')} no-underline`}><IconGitHub size={14} />Log in with GitHub</a>
        )}
      </div>
    </header>
  );
}
