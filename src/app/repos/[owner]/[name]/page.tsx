import { Suspense } from 'react';
import IssueList from '@/components/IssueList';

// The component reads the URL on the client, so it sits inside Suspense (required with cacheComponents).
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-zinc-500">Loading…</p>}>
      <IssueList />
    </Suspense>
  );
}
