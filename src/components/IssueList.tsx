'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import Mascot from './mascot/Mascot';
import Shell from './Shell';
import { ErrorNote } from './ui';
import { ago } from '@/lib/client';
import { useIssues } from '@/lib/hooks';

function Issues({ owner, name }: { owner: string; name: string }) {
  const { issues, error } = useIssues(owner, name);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/" className="font-mono text-[13px] text-subtle no-underline hover:text-foreground">← Repositories</Link>
        <h1 className="font-mono text-[clamp(20px,3vw,28px)] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{owner}/<span className="text-purple-200">{name}</span></h1>
        <p className="text-sm text-muted">Open issues. Pick the bug you cannot reproduce.</p>
      </div>
      {error && <ErrorNote message={error} />}
      {issues === null && !error && <p className="font-mono text-sm text-subtle">Loading issues…</p>}
      {issues && issues.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-purple-800">
          {issues.map((i) => (
            <li key={i.number} className="border-b border-purple-800 last:border-b-0">
              <Link href={`/repos/${owner}/${name}/issues/${i.number}`} className="flex gap-4 bg-purple-900 px-[18px] py-4 text-foreground no-underline transition-colors hover:bg-[#1a0f40]">
                <span className="w-7 flex-none font-mono text-[13px] font-semibold text-hot">#{i.number}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-semibold">{i.title}</span>
                  <span className="line-clamp-2 text-sm text-muted">{i.body}</span>
                  <span className="font-mono text-xs text-subtle">{ago(i.createdAt)} · {i.comments} comment{i.comments === 1 ? '' : 's'}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {issues && issues.length === 0 && (
        <div className="flex flex-col items-center gap-3.5 rounded-lg border border-dashed border-purple-700 px-6 py-12 text-center">
          <Mascot pose="idle" size={128} />
          <h2 className="font-mono text-[17px] font-semibold">No open issues</h2>
          <p className="max-w-[360px] text-sm text-muted">This repository has no open issues. Nothing to chase here.</p>
          <Link href="/" className="font-mono text-[13px] font-medium">Pick another repository</Link>
        </div>
      )}
    </div>
  );
}

export default function IssueList() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  return <Shell maxWidth={880}>{() => <Issues owner={owner} name={name} />}</Shell>;
}
