'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from './Shell';
import { ErrorNote } from './ui';
import { ago, api, type IssueItem } from '@/lib/client';

function Issues({ owner, name }: { owner: string; name: string }) {
  const [issues, setIssues] = useState<IssueItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ issues: IssueItem[] }>(`/api/repos/${owner}/${name}/issues`).then((r) => setIssues(r.issues)).catch((e: Error) => setError(e.message));
  }, [owner, name]);
  return (
    <>
      <Link href="/" className="text-sm text-zinc-500 hover:underline">← Repositories</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{owner}/{name}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Open issues. Pick the bug you cannot reproduce.</p>
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      <ul className="mt-4 grid gap-3">
        {issues === null && !error && <li className="text-sm text-zinc-500">Loading issues…</li>}
        {issues?.length === 0 && <li className="text-sm text-zinc-500">This repository has no open issues.</li>}
        {issues?.map((i) => (
          <li key={i.number}>
            <Link href={`/repos/${owner}/${name}/issues/${i.number}`} className="block rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">#{i.number} {i.title}</span>
                <span className="shrink-0 text-xs text-zinc-500">{ago(i.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{i.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function IssueList() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  return <Shell>{() => <Issues owner={owner} name={name} />}</Shell>;
}
