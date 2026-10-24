import { Suspense } from 'react';
import { PageLoader } from '@/components/loaders';
import TicketForm from '@/components/TicketForm';

// The component reads the URL on the client, so it sits inside Suspense (required with cacheComponents).
export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <TicketForm />
    </Suspense>
  );
}
