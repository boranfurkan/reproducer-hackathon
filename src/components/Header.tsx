'use client';

import Link from 'next/link';
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
            <Link href="/insights" className="text-muted no-underline hover:text-foreground">Insights</Link>
            <UserTile letters={initials(user.name, user.login)} />
            <span className="max-w-[30vw] truncate">{user.login}</span>
            <button onClick={logout} className={buttonClass('secondary', 'sm')}>Log out</button>
          </div>
        ) : (
          <a href="/api/auth/login" className={`${buttonClass('primary', 'sm')} no-underline`}>Log in with GitHub</a>
        )}
      </div>
    </header>
  );
}
