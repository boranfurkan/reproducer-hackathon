'use client';

import { useEffect, useState } from 'react';
import { api, type SessionUser } from '@/lib/client';

/** undefined while loading, null when logged out. */
export function useSession(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => {
    api<{ user: SessionUser | null }>('/api/session').then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  return user;
}
