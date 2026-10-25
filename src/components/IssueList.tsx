'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { IconArrowRight } from './icons';
import { IssueRowsSkeleton } from './loaders';
import Mascot from './mascot/Mascot';
import Shell from './Shell';
import { BackLink, ErrorNote } from './ui';
import { ago } from '@/lib/client';
import { prewarm, useIssues, useTriage } from '@/lib/hooks';

function Issues({ owner, name }: { owner: string; name: string }) {
  const { issues, error } = useIssues(owner, name);
  // The model's read of each issue arrives a moment after the list; the list never waits for it.
  const triage = useTriage(owner, name);
  // Opening the repository is the first sign of an investigation: start the sandbox now (it takes about a minute).
  useEffect(() => prewarm(owner, name), [owner, name]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <BackLink href="/">Repositories</BackLink>
        <h1 className="font-mono text-[clamp(20px,3vw,28px)] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{owner}/<span className="text-purple-200">{name}</span></h1>
        <p className="text-sm text-muted">Open issues. Pick the bug you cannot reproduce.</p>
      </div>
      {error && <ErrorNote message={error} />}
      {issues === null && !error && <IssueRowsSkeleton />}
      {issues && issues.length > 0 && (
        <ul data-tour="tickets" className="flex flex-col gap-3">
          {issues.map((i) => (
            <li key={i.number}>
              {/* A ticket: a stub with the number, a perforated edge with punched notches, the report on the right. */}
              <Link href={`/repos/${owner}/${name}/issues/${i.number}`} className="group flex rounded-lg border border-purple-800 bg-purple-900 text-foreground no-underline transition-colors hover:border-purple-500 hover:bg-[#1a0f40]">
                <span className="flex w-[76px] flex-none flex-col items-center justify-center gap-1 rounded-l-lg bg-purple-850 px-2 py-4 sm:w-[96px]">
                  <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-subtle uppercase">Ticket</span>
                  <span className="font-mono text-xl font-semibold text-hot sm:text-2xl">#{i.number}</span>
                </span>
                <span aria-hidden="true" className="relative w-0 flex-none self-stretch border-l-2 border-dashed border-purple-700">
                  <span className="absolute -top-px -left-[9px] h-2 w-4 rounded-b-full border border-t-0 border-purple-800 bg-purple-950 transition-colors group-hover:border-purple-500" />
                  <span className="absolute -bottom-px -left-[9px] h-2 w-4 rounded-t-full border border-b-0 border-purple-800 bg-purple-950 transition-colors group-hover:border-purple-500" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 px-5 py-4">
                  <span className="font-semibold">{i.title}</span>
                  <span className="line-clamp-2 text-sm text-muted">{i.body}</span>
                  <span className="font-mono text-xs text-subtle">{ago(i.createdAt)} · {i.comments} comment{i.comments === 1 ? '' : 's'}</span>
                  {(triage[i.number]?.environmentSpecific || triage[i.number]?.similar) && (
                    <span data-tour="triage" className="mt-0.5 flex flex-wrap gap-1.5 font-mono text-[11px] font-medium">
                      {triage[i.number].environmentSpecific && <span className="rounded-sm bg-amber/12 px-2 py-0.5 text-amber">likely environment-specific{triage[i.number].hint ? ` · ${triage[i.number].hint}` : ''}</span>}
                      {triage[i.number].similar && <span className="rounded-sm bg-pass/12 px-2 py-0.5 text-pass">looks like {triage[i.number].similar!.issue}, fixed{triage[i.number].similar!.outcome === 'merged' ? ' and merged' : ''}</span>}
                    </span>
                  )}
                </span>
                <span className="hidden flex-none items-center pr-5 text-subtle transition-colors group-hover:text-foreground sm:flex">
                  <IconArrowRight />
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
  return <Shell>{() => <Issues owner={owner} name={name} />}</Shell>;
}
