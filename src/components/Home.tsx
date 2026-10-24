'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Header from './Header';
import { Badge, Card, ErrorNote } from './ui';
import { useSession } from './useSession';
import { ago, api, type ClusterAlert, type MemoryFacets, type RepoItem, type RunView } from '@/lib/client';

function Landing({ error }: { error: string | null }) {
  const steps = [
    ['1', 'Pick an issue', 'Choose a repository and one of its open issues, the bug nobody can reproduce.'],
    ['2', 'Describe who hit it', 'Add the reporter’s device, browser, language, anything the issue leaves out.'],
    ['3', 'Watch it investigate', 'ReProducer rebuilds that environment, finds what only that user has, and writes a failing test.'],
    ['4', 'Approve the fix', 'It fixes the code until the test passes, then waits for your OK before opening a pull request.'],
  ];
  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="text-4xl font-semibold tracking-tight">Bugs you cannot reproduce, reproduced.</h1>
      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">Clients report bugs that only happen on their device, in their language, in their timezone. ReProducer builds that environment, investigates by experiment, and proposes a verified fix.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">Login did not complete ({error.replaceAll('_', ' ')}). Please try again.</p>}
      <a href="/api/auth/login" className="mt-6 inline-block rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Continue with GitHub</a>
      <ol className="mt-12 grid gap-4 sm:grid-cols-2">
        {steps.map(([n, title, text]) => (
          <li key={n}>
            <Card className="h-full">
              <span className="text-xs font-semibold text-zinc-500">STEP {n}</span>
              <h2 className="mt-1 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Dashboard() {
  const [repos, setRepos] = useState<RepoItem[] | null>(null);
  const [runs, setRuns] = useState<RunView[] | null>(null);
  const [memory, setMemory] = useState<MemoryFacets | null>(null);
  const [clusters, setClusters] = useState<ClusterAlert[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api<{ repos: RepoItem[] }>('/api/repos').then((r) => setRepos(r.repos)).catch((e: Error) => setError(e.message));
    api<{ runs: RunView[] }>('/api/runs').then((r) => setRuns(r.runs)).catch(() => setRuns([]));
    api<MemoryFacets>('/api/memory').then(setMemory).catch(() => setMemory(null));
    api<{ clusters: ClusterAlert[] }>('/api/clusters').then((r) => setClusters(r.clusters)).catch(() => setClusters([]));
  }, []);

  const shown = useMemo(() => (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase())), [repos, filter]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a repository</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">The one with the bug reports. Public repositories only for now.</p>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter repositories" className="mt-4 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        {error && <div className="mt-4"><ErrorNote message={error} /></div>}
        <ul className="mt-4 grid gap-3">
          {repos === null && !error && <li className="text-sm text-zinc-500">Loading repositories…</li>}
          {shown.map((r) => (
            <li key={r.fullName}>
              <Link href={`/repos/${r.owner}/${r.name}`} className="block rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{r.fullName}</span>
                  <span className="text-xs text-zinc-500">{r.isPrivate ? 'private' : 'public'} · {r.openIssues} open</span>
                </div>
                {r.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.description}</p>}
              </Link>
            </li>
          ))}
          {repos && shown.length === 0 && <li className="text-sm text-zinc-500">No repositories match.</li>}
        </ul>
      </div>
      <aside>
        {clusters.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold">Possible shared bugs</h2>
            <ul className="mt-2 grid gap-2">
              {clusters.map((c, i) => (
                <li key={i} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
                  <strong>{c.count} reports</strong> from {c.engine} / {c.locale} in {c.repo}
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400">{c.users} reporter{c.users === 1 ? '' : 's'}, latest {ago(c.lastAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <h2 className="text-lg font-semibold">Recent investigations</h2>
        <ul className="mt-3 grid gap-2">
          {runs === null && <li className="text-sm text-zinc-500">Loading…</li>}
          {runs?.length === 0 && <li className="text-sm text-zinc-500">None yet.</li>}
          {runs?.map((r) => (
            <li key={r._id}>
              <Link href={`/runs/${r._id}`} className="block rounded-lg border border-zinc-200 p-3 text-sm hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.repo}#{r.issueNumber}</span>
                  <Badge kind={r.prUrl ? 'fixed' : r.status} label={r.prUrl ? 'PR opened' : undefined} />
                </div>
                <p className="mt-1 truncate text-zinc-600 dark:text-zinc-400">{r.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{ago(r.createdAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
        {memory && memory.total > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">What it has learned</h2>
            <p className="mt-1 text-xs text-zinc-500">{memory.total} verified fixes in memory. What isolated each bug:</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {memory.variable.map((b) => (
                <li key={b.value} className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700">{b.value} <span className="text-zinc-500">×{b.count}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500">Engines: {memory.engine.map((b) => `${b.value} ×${b.count}`).join(', ')}</p>
            <p className="mt-1 text-xs text-zinc-500">Locales: {memory.locale.map((b) => `${b.value} ×${b.count}`).join(', ')}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function Home() {
  const user = useSession();
  return (
    <>
      <Header user={user ?? null} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {user === undefined ? <p className="text-sm text-zinc-500">Loading…</p> : user ? <Dashboard /> : <Landing error={typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('error')} />}
      </main>
    </>
  );
}
