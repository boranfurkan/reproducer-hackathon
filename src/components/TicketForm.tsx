'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from './Shell';
import { buttonClass, Card, ErrorNote } from './ui';
import { api, ApiError, type IssueItem, type MediaItem } from '@/lib/client';

const EXAMPLES = [
  'Samsung Galaxy Z Flip, Chrome on Android, phone language is Turkish, customer is in Istanbul',
  'iPhone, opened from an in-app browser, language English (UK)',
  'Chrome on a Windows laptop, language English (US)',
];

function Form({ owner, name, number }: { owner: string; name: string; number: number }) {
  const router = useRouter();
  const [issue, setIssue] = useState<IssueItem | null>(null);
  const [notes, setNotes] = useState('');
  const [env, setEnv] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Get the sandbox ready while the form is being filled in (a cold start installs Playwright, about 2 minutes).
  useEffect(() => {
    api('/api/warm', { method: 'POST', body: JSON.stringify({ owner, name }) }).catch(() => undefined);
  }, [owner, name]);

  useEffect(() => {
    api<{ issues: IssueItem[] }>(`/api/repos/${owner}/${name}/issues`)
      .then((r) => setIssue(r.issues.find((i) => i.number === number) ?? null))
      .catch((e: Error) => setError(e.message));
  }, [owner, name, number]);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      const json = (await res.json().catch(() => ({}))) as { media?: Omit<MediaItem, 'label'>; error?: string };
      if (!res.ok || !json.media) throw new ApiError(json.error ?? 'Upload failed', res.status);
      setMedia((m) => [...m, { ...json.media!, label: file.name }].slice(0, 3));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    setBusy(true);
    setError('');
    // One KEY=value per line. These go to the sandbox only and are never stored.
    const envVars = Object.fromEntries(
      env.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
    try {
      const { runId } = await api<{ runId: string }>('/api/runs', { method: 'POST', body: JSON.stringify({ owner, name, issueNumber: number, notes, envVars, media: media.map((m) => ({ uri: m.uri, mimeType: m.mimeType, kind: m.kind, name: m.name })) }) });
      router.push(`/runs/${runId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Link href={`/repos/${owner}/${name}`} className="text-sm text-zinc-500 hover:underline">← {owner}/{name}</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Investigate #{number}</h1>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">The report</h2>
          {issue ? (
            <>
              <h3 className="mt-2 font-medium">{issue.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{issue.body || 'No description.'}</p>
              <a href={issue.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-zinc-500 hover:underline">Open on GitHub ↗</a>
            </>
          ) : error ? null : (
            <p className="mt-2 text-sm text-zinc-500">Loading…</p>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Who hit the bug?</span>
            <span className="text-xs text-zinc-500">Device, browser, language, location: whatever the report leaves out. The agent rebuilds this environment.</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder={EXAMPLES[0]} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
            <span className="flex flex-wrap gap-2 text-xs">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setNotes(ex)} className="rounded-full border border-zinc-300 px-2.5 py-1 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900">{ex.slice(0, 34)}…</button>
              ))}
            </span>
          </label>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Screen recording or screenshot <span className="font-normal text-zinc-500">(optional)</span></span>
            <span className="text-xs text-zinc-500">The customer&apos;s recording of the bug. The agent watches it for the steps and for clues about their device and language. mp4, webm, mov, png, jpg or webp, up to 50 MB.</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp" disabled={uploading || media.length >= 3} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} className="text-sm file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-transparent file:px-3 file:py-1.5 file:text-sm dark:file:border-zinc-700" />
            {uploading && <span className="text-xs text-zinc-500">Uploading…</span>}
            {media.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs">
                {media.map((m) => (
                  <li key={m.uri} className="flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-700">
                    {m.kind === 'video' ? 'Video' : 'Image'}: {m.label}
                    <button type="button" aria-label={`Remove ${m.label}`} onClick={() => setMedia((all) => all.filter((x) => x.uri !== m.uri))} className="ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Environment variables <span className="font-normal text-zinc-500">(optional)</span></span>
            <span className="text-xs text-zinc-500">One KEY=value per line, if the app needs them to start. Sent to the sandbox only; never stored or logged.</span>
            <textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} spellCheck={false} placeholder="PORT=3000" className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700" />
          </label>
          {error && <ErrorNote message={error} />}
          <div>
            <button onClick={start} disabled={busy || uploading || !issue} className={buttonClass.primary}>{busy ? 'Starting…' : 'Investigate'}</button>
            <p className="mt-2 text-xs text-zinc-500">A run takes a few minutes. Nothing is pushed to GitHub until you approve.</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TicketForm() {
  const { owner, name, number } = useParams<{ owner: string; name: string; number: string }>();
  return <Shell>{() => <Form owner={owner} name={name} number={Number(number)} />}</Shell>;
}
