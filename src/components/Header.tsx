'use client';

import Link from 'next/link';
import { buttonClass } from './ui';
import type { SessionUser } from '@/lib/client';

export default function Header({ user }: { user: SessionUser | null }) {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Reload: the session state lives in client components, and every page shows a login prompt when logged out.
    window.location.reload();
  }
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">ReProducer</Link>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            {user.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" className="h-7 w-7 rounded-full" />
            )}
            <span>{user.login}</span>
            <button onClick={logout} className={buttonClass.secondary}>Log out</button>
          </div>
        ) : (
          <a href="/api/auth/login" className={buttonClass.primary}>Continue with GitHub</a>
        )}
      </div>
    </header>
  );
}
