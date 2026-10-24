import { Suspense } from 'react';
import { PageLoader } from '@/components/loaders';
import IssueList from '@/components/IssueList';

// The component reads the URL on the client, so it sits inside Suspense (required with cacheComponents).
export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <IssueList />
    </Suspense>
  );
}
