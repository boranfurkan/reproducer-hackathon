'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Shell from './Shell';
import { Badge, buttonClass, Card, ErrorNote } from './ui';
import { api, type MatrixRow, type RunView, type SimilarFix, type TimelineEvent } from '@/lib/client';

const LABELS: Record<string, string> = {
  understood: 'Read the report',
  profile: 'Rebuilt the environment',
  boot: 'Sandbox',
  hypothesis: 'Hypothesis',
  memory: 'Memory',
  matrix: 'Replay matrix',
  root_cause: 'Root cause',
  test_written: 'Failing test',
  fix_attempt: 'Fix attempt',
  green: 'Verified',
  approval_requested: 'Waiting for you',
  pr_opened: 'Pull request',
  stopped: 'Stopped',
};

const secs = (ms: number) => `${Math.round(ms / 1000)}s`;

function MatrixTable({ rows }: { rows: MatrixRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
              <td className="whitespace-nowrap px-3 py-2 font-mono">{r.name}</td>
              <td className="px-3 py-2"><Badge kind={r.ok ? 'pass' : 'fail'} /></td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.ok ? '' : r.errors?.[0] || r.failure || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventRow({ e }: { e: TimelineEvent }) {
  const firstLine = e.summary.split('\n')[0];
  const rows = e.type === 'matrix' && Array.isArray(e.data) ? (e.data as MatrixRow[]) : null;
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{LABELS[e.type] ?? e.type}</span>
        <span className="text-xs text-zinc-500">{secs(e.atMs)}</span>
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{firstLine}</p>
      {rows && <MatrixTable rows={rows} />}
      {e.type === 'memory' && Array.isArray(e.data) && (
        <ul className="mt-1 list-inside list-disc text-xs text-zinc-600 dark:text-zinc-400">{(e.data as { id: string; title: string; isolatedVariable: string; file: string; score: number }[]).map((h) => <li key={h.id}>{h.title} <span className="text-zinc-500">(isolated by {h.isolatedVariable}, {h.file})</span></li>)}</ul>
      )}
      {e.type === 'test_written' && typeof e.data === 'string' && (
        <details className="mt-1 text-xs text-zinc-500"><summary className="cursor-pointer">Test output</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-zinc-100 p-2 dark:bg-zinc-900">{e.data}</pre></details>
      )}
    </li>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-950">
      {diff.split('\n').map((l, i) => (
        <span key={i} className={`block ${l.startsWith('+') && !l.startsWith('+++') ? 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-300' : l.startsWith('-') && !l.startsWith('---') ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300' : l.startsWith('@@') ? 'text-blue-600 dark:text-blue-400' : ''}`}>{l || ' '}</span>
      ))}
    </pre>
  );
}

function Approval({ run, similar, onChange }: { run: RunView; similar: SimilarFix[]; onChange: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');
  async function act(kind: 'approve' | 'reject') {
    setBusy(kind);
    setError('');
    try {
      await api(`/api/runs/${run._id}/${kind}`, { method: 'POST' });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  if (run.prUrl) {
    return (
      <Card>
        <h2 className="font-semibold">Pull request opened</h2>
        <a href={run.prUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">{run.prUrl}</a>
      </Card>
    );
  }
  if (run.rejectedAt) return <Card><h2 className="font-semibold">Rejected</h2><p className="mt-1 text-sm text-zinc-500">Nothing was pushed to GitHub.</p></Card>;
  return (
    <Card>
      <h2 className="text-lg font-semibold">Your approval</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Nothing has been pushed to GitHub. Approving creates a branch and opens a pull request with this change and its test.</p>
      {run.rootCause && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Root cause</h3>
          <p className="mt-1 text-sm"><code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">{run.rootCause.file}</code> {run.rootCause.rootCause}</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{run.rootCause.explanation}</p>
        </div>
      )}
      {run.diff && <div className="mt-4"><h3 className="mb-1 text-sm font-semibold">Change</h3><DiffView diff={run.diff} /></div>}
      {similar.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Similar past fixes</h3>
          <ul className="mt-1 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">{similar.map((f) => <li key={f.id}>{f.title} <span className="text-zinc-500">({f.repo}#{f.issueNumber}, {f.file})</span></li>)}</ul>
        </div>
      )}
      {run.profile?.notEmulated?.length ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">What could not be reproduced</h3>
          <ul className="mt-1 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">{run.profile.notEmulated.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      ) : null}
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      <div className="mt-5 flex gap-3">
        <button onClick={() => act('approve')} disabled={busy !== null} className={buttonClass.primary}>{busy === 'approve' ? 'Opening pull request…' : 'Approve and open pull request'}</button>
        <button onClick={() => act('reject')} disabled={busy !== null} className={buttonClass.secondary}>Reject</button>
      </div>
    </Card>
  );
}

function Run({ id }: { id: string }) {
  const [run, setRun] = useState<RunView | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [similar, setSimilar] = useState<SimilarFix[]>([]);
  const [error, setError] = useState('');
  // Bumping `tick` reloads the run: the poll timer and the approval buttons both do it.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    api<{ run: RunView; events: TimelineEvent[]; similar: SimilarFix[] }>(`/api/runs/${id}`)
      .then((r) => {
        if (!alive) return;
        setRun(r.run);
        setEvents(r.events);
        setSimilar(r.similar ?? []);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id, tick]);

  const running = run?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 2500);
    return () => clearInterval(t);
  }, [running, reload]);

  if (error && !run) return <ErrorNote message={error} />;
  if (!run) return <p className="text-sm text-zinc-500">Loading…</p>;
  const [owner, repo] = run.repo.split('/');

  return (
    <>
      <Link href={`/repos/${owner}/${repo}`} className="text-sm text-zinc-500 hover:underline">← {run.repo}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">#{run.issueNumber} {run.title}</h1>
        <Badge kind={run.status} />
      </div>
      {run.reason && run.status !== 'running' && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{run.reason}</p>}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr] [&>*]:min-w-0">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Timeline</h2>
          <ol className="mt-4 grid gap-4 border-l border-zinc-200 pl-0 dark:border-zinc-800">
            {events.map((e) => <EventRow key={e.seq} e={e} />)}
            {running && <li className="pl-6 text-sm text-zinc-500">Working…</li>}
          </ol>
        </Card>
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          {run.status === 'fixed' && <Approval run={run} similar={similar} onChange={reload} />}
          {run.status !== 'fixed' && run.status !== 'running' && (
            <Card>
              <h2 className="font-semibold">Needs a human</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">The agent stopped without a verified fix and has not changed anything. Add more detail about the reporter&apos;s environment and run it again.</p>
              <Link href={`/repos/${owner}/${repo}/issues/${run.issueNumber}`} className={`${buttonClass.secondary} mt-3`}>Try again with more detail</Link>
            </Card>
          )}
          {run.profile && (
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Reporter environment</h2>
              <p className="mt-2 text-sm">{run.profile.engine}, {run.profile.locale}, {run.profile.timezoneId}{run.decisiveVariables?.length ? ` · isolated: ${run.decisiveVariables.join(', ')}` : ''}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  return <Shell>{() => <Run id={id} />}</Shell>;
}
