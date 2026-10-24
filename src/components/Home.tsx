'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Header from './Header';
import Mascot from './mascot/Mascot';
import SiteFooter from './SiteFooter';
import { ErrorNote, Eyebrow, Panel, RunStatusChip, buttonClass } from './ui';
import { ago, type MemoryFacets } from '@/lib/client';
import { useClusters, useMemoryFacets, useRepos, useRuns, useSession } from '@/lib/hooks';
import type { Pose } from './mascot/pixels';

const STEPS: { title: string; text: string; pose: Pose }[] = [
  { title: 'Pick an issue', text: 'Choose a repository and one of its open issues, the bug nobody can reproduce.', pose: 'idle' },
  { title: 'Describe who hit it', text: 'Add the reporter’s device, browser, language, anything the issue leaves out.', pose: 'wave' },
  { title: 'Watch it investigate', text: 'ReProducer rebuilds that environment, finds what only that user has, and writes a failing test.', pose: 'investigating' },
  { title: 'Approve the fix', text: 'It fixes the code until the test passes, then waits for your OK before opening a pull request.', pose: 'waiting' },
];

function Landing({ error }: { error: string | null }) {
  return (
    <div className="flex flex-col gap-12 sm:gap-20">
      <div className="flex flex-wrap-reverse items-center gap-8">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-5">
          <span className="font-mono text-xs font-medium tracking-[0.08em] text-hot">FOR THE BUG THAT ONLY HAPPENS TO THEM</span>
          <h1 className="font-mono text-[clamp(32px,5.4vw,56px)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">Bugs you cannot reproduce, reproduced.</h1>
          <p className="max-w-[560px] text-[17px] text-muted">
            Clients report bugs that only happen on their device, in their language, in their timezone. ReProducer builds that environment, investigates by experiment, and proposes a verified fix.
          </p>
          {error && <ErrorNote message={`Login did not complete (${error.replaceAll('_', ' ')}). Please try again.`} />}
          <div className="flex flex-wrap items-center gap-4">
            <a href="/api/auth/login" className={`${buttonClass('primary', 'lg')} no-underline`}>Log in with GitHub</a>
            <span className="max-w-[280px] text-[13px] text-subtle">It reads your issues. It opens a pull request only after you approve.</span>
          </div>
        </div>
        <div className="flex flex-[1_1_240px] justify-center">
          <Mascot pose="investigating" size="min(280px, 60vw)" />
        </div>
      </div>
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col overflow-hidden rounded-lg border border-purple-800 bg-purple-900">
            <div className="flex aspect-[4/3] items-center justify-center bg-[repeating-linear-gradient(135deg,#140b32_0_10px,#190f3c_10px_20px)]">
              <Mascot pose={s.pose} size={96} label="" />
            </div>
            <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-5">
              <span className="font-mono text-xs font-medium text-hot">{String(i + 1).padStart(2, '0')}</span>
              <h2 className="font-mono text-base font-semibold">{s.title}</h2>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LearnedPanel({ memory }: { memory: MemoryFacets }) {
  const max = Math.max(1, ...memory.variable.map((b) => b.count));
  return (
    <Panel className="flex flex-col gap-3.5 p-[18px]">
      <div className="flex flex-col gap-1">
        <h2 className="font-mono text-[15px] font-semibold">What it has learned</h2>
        <p className="text-[13px] text-subtle">{memory.total} verified fixes in memory. What isolated each bug:</p>
      </div>
      <div className="flex flex-col gap-2 font-mono text-[13px]">
        {memory.variable.map((b) => (
          <div key={b.value} className="grid grid-cols-[80px_1fr_24px] items-center gap-2.5">
            <span className="truncate">{b.value}</span>
            <span className={`h-2 ${b.count === max ? 'bg-hot' : 'bg-purple-400'}`} style={{ width: `${(b.count / max) * 100}%` }} />
            <span className="text-right text-subtle">{b.count}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-purple-800 pt-3 font-mono text-xs text-muted">
        <span><span className="text-subtle">Engines </span>{memory.engine.map((b) => `${b.value} ×${b.count}`).join(' · ')}</span>
        <span><span className="text-subtle">Locales </span>{memory.locale.map((b) => `${b.value} ×${b.count}`).join(' · ')}</span>
      </div>
    </Panel>
  );
}

function Dashboard() {
  const { repos, error } = useRepos();
  const runs = useRuns();
  const memory = useMemoryFacets();
  const clusters = useClusters();
  const [filter, setFilter] = useState('');
  const [showPrivate, setShowPrivate] = useState(false);

  // Public repositories first, most open issues first: the sandbox can only clone public repositories, and a long list of private names
  // does not belong on screen (or in a demo recording) unless asked for.
  const privateCount = (repos ?? []).filter((r) => r.isPrivate).length;
  const shown = useMemo(
    () =>
      (repos ?? [])
        .filter((r) => showPrivate || !r.isPrivate)
        .filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => Number(a.isPrivate) - Number(b.isPrivate) || b.openIssues - a.openIssues),
    [repos, filter, showPrivate],
  );

  return (
    <div className="flex flex-wrap items-start gap-6 lg:gap-12">
      <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
        <div className="flex items-center gap-4">
          <Mascot pose="idle" size={72} />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-mono text-[clamp(22px,3vw,28px)] leading-tight font-semibold tracking-[-0.02em]">Choose a repository</h1>
            <p className="text-sm text-muted">The one with the bug reports. Public repositories only for now (the sandbox clones over plain HTTPS).</p>
          </div>
        </div>
        <label className="flex items-center gap-2.5 rounded-md border border-purple-700 bg-ink px-3 py-2.5 focus-within:border-purple-400">
          <span className="font-mono text-[13px] text-subtle" aria-hidden="true">/</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter repositories" aria-label="Filter repositories" className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-foreground outline-0 placeholder:text-subtle" />
        </label>
        {error && <ErrorNote message={error} />}
        <ul className="flex flex-col gap-2">
          {repos === null && !error && <li className="font-mono text-sm text-subtle">Loading repositories…</li>}
          {shown.map((r) => (
            <li key={r.fullName}>
              <Link href={`/repos/${r.owner}/${r.name}`} className="flex items-center gap-4 rounded-lg border border-purple-800 bg-purple-900 px-[18px] py-4 text-foreground no-underline transition-colors hover:border-purple-500 hover:bg-lift">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-mono text-sm font-semibold [overflow-wrap:anywhere]">{r.owner}/<span className="text-purple-200">{r.name}</span></span>
                  {r.description && <span className="text-sm text-muted">{r.description}</span>}
                </div>
                <span className="flex flex-none flex-col items-end gap-0.5 font-mono text-xs text-subtle">
                  <span className={`font-semibold ${r.openIssues > 0 ? 'text-hot' : 'text-muted'}`}>{r.openIssues} open</span>
                  {r.isPrivate ? 'private' : 'public'}
                </span>
              </Link>
            </li>
          ))}
          {repos && shown.length === 0 && <li className="font-mono text-sm text-subtle">No repositories match.</li>}
        </ul>
        {privateCount > 0 && (
          <button type="button" onClick={() => setShowPrivate((v) => !v)} className="self-start text-left text-[13px] text-subtle underline underline-offset-[3px] hover:text-foreground">
            {showPrivate ? 'Hide private repositories' : `Show ${privateCount} private repositories (cannot be investigated yet)`}
          </button>
        )}
      </div>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        {clusters.map((c, i) => (
          <section key={i} className="flex flex-col gap-2 rounded-lg border border-amber/35 bg-amber/6 px-[18px] py-4">
            <h2 className="font-mono text-[13px] font-semibold tracking-[0.04em] text-amber">POSSIBLE SHARED BUG</h2>
            <p className="text-sm"><b>{c.count} reports</b> from {c.engine} / {c.locale} in {c.repo?.split('/')[1] ?? c.repo}</p>
            <p className="font-mono text-xs text-muted">{c.users} reporter{c.users === 1 ? '' : 's'}, latest {ago(c.lastAt)}</p>
          </section>
        ))}

        <section className="flex flex-col gap-2.5">
          <Eyebrow>Recent investigations</Eyebrow>
          {runs === null && <p className="font-mono text-sm text-subtle">Loading…</p>}
          {runs?.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-purple-700 px-4 py-6 text-center">
              <Mascot pose="idle" size={64} label="" />
              <p className="text-sm text-muted">Nothing yet. Pick a repository and an issue.</p>
            </div>
          )}
          {runs?.map((r) => (
            <Link key={r._id} href={`/runs/${r._id}`} className="flex flex-col gap-1.5 rounded-md border border-purple-800 bg-purple-900 px-3.5 py-3 text-foreground no-underline transition-colors hover:border-purple-500">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-[13px] font-semibold">{r.repo.split('/')[1]}#{r.issueNumber}</span>
                <RunStatusChip run={r} inList />
              </span>
              <span className="truncate text-sm text-muted">{r.title}</span>
              <span className="font-mono text-xs text-subtle">{ago(r.createdAt)}</span>
            </Link>
          ))}
        </section>

        {memory && memory.total > 0 && <LearnedPanel memory={memory} />}
      </aside>
    </div>
  );
}

export default function Home() {
  const user = useSession();
  const loginError = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('error');
  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user ?? null} />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-16 sm:px-8 sm:pt-12">
        {user === undefined ? <p className="font-mono text-sm text-subtle">Loading…</p> : user ? <Dashboard /> : <Landing error={loginError} />}
      </main>
      <SiteFooter />
    </div>
  );
}
