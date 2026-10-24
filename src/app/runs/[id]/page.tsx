import { Suspense } from 'react';
import RunPage from '@/components/RunPage';

// The component reads the URL on the client, so it sits inside Suspense (required with cacheComponents).
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-zinc-500">Loading…</p>}>
      <RunPage />
    </Suspense>
  );
}
