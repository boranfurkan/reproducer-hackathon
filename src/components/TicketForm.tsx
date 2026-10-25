'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { IconExternal, IconSearch, IconX } from './icons';
import { Busy, ReportSkeleton } from './loaders';
import Shell from './Shell';
import { BackLink, ErrorNote, Eyebrow, PixelDots, Panel, buttonClass } from './ui';
import type { MediaItem } from '@/lib/client';
import { startRun, uploadMedia, useIssues, useWarmSandbox } from '@/lib/hooks';

const EXAMPLES = [
  'Samsung Galaxy Z Flip, Chrome on Android, phone language is Turkish, customer is in Istanbul',
  'iPhone, opened from an in-app browser, language English (UK)',
  'Chrome on a Windows laptop, language English (US)',
];

// What the developer knows about each reporter of the demo repository's tickets (docs/DEMO-BUGS.md), one click away while recording.
const DEMO_REPO = 'boranfurkan/reproducer-hackathon-demo';
const DEMO_NOTES: { issue: number; label: string; notes: string }[] = [
  { issue: 8, label: 'Munich, Chrome, German', notes: 'Customer in Munich, Chrome on Windows 11, German is her language.' },
  { issue: 9, label: 'MacBook Safari, accessibility settings', notes: 'MacBook Air, Safari. She told me she changed some accessibility settings on her Mac a while ago because things moving on screen make her dizzy.' },
  { issue: 10, label: 'Windows Chrome, privacy extensions', notes: 'Chrome on a Windows work laptop. He says he is careful about privacy and has a few browser extensions.' },
  { issue: 11, label: 'Edinburgh and Manchester', notes: 'The customers who wrote are in Edinburgh and Manchester. Our agency is in Istanbul and my laptop clock is set to UTC.' },
  { issue: 12, label: 'iPhone 8, never updated', notes: "iPhone 8, she hasn't updated it in years, Safari." },
];

function Form({ owner, name, number }: { owner: string; name: string; number: number }) {
  const router = useRouter();
  const { issues, error: issuesError } = useIssues(owner, name);
  const issue = issues?.find((i) => i.number === number) ?? null;
  // "Try again with more detail" on a stopped run brings the earlier notes back.
  const [notes, setNotes] = useState(useSearchParams().get('notes') ?? '');
  const [env, setEnv] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deep, setDeep] = useState(true);
  const [formError, setFormError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const error = formError || issuesError;
  const isDemo = `${owner}/${name}`.toLowerCase() === DEMO_REPO;

  // Get the sandbox ready while the form is being filled in (a cold start installs Playwright, about 2 minutes).
  const warm = useWarmSandbox(owner, name);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError('');
    try {
      const item = await uploadMedia(file);
      setMedia((m) => [...m, item].slice(0, 3));
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    setBusy(true);
    setFormError('');
    try {
      router.push(`/runs/${await startRun({ owner, name, issueNumber: number, notes, envText: env, media, deep })}`);
    } catch (e) {
      setFormError((e as Error).message);
      setBusy(false);
    }
  }

  const field = 'rounded-md border bg-ink text-foreground outline-0 placeholder:text-subtle focus:border-purple-500 focus:shadow-[0_0_0_3px_rgba(155,116,240,0.18)]';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <BackLink href={`/repos/${owner}/${name}`}>{owner}/{name}</BackLink>
          <h1 className="font-mono text-[clamp(22px,3vw,28px)] leading-tight font-semibold tracking-[-0.02em]">Investigate <span className="text-hot">#{number}</span></h1>
        </div>
        {warm === 'warming' && (
          <div role="status" data-tour="sandbox" className="flex items-center gap-2.5 rounded-md border border-cyan/25 bg-cyan/8 px-3 py-2 font-mono text-xs font-medium text-cyan">
            <PixelDots />
            Sandbox warming up · installing Playwright, about 2 min
          </div>
        )}
        {warm === 'warm' && (
          <div role="status" data-tour="sandbox" className="flex items-center gap-2 rounded-md border border-pass/25 bg-pass/8 px-3 py-2 font-mono text-xs font-medium text-pass">
            <span className="size-1.5 bg-pass" aria-hidden="true" />
            Sandbox ready
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Panel tour="report" className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5 px-[22px] py-5">
          <Eyebrow>The report</Eyebrow>
          {issue ? (
            <>
              <h3 className="font-mono text-[17px] leading-snug font-semibold">{issue.title}</h3>
              <p className="whitespace-pre-wrap text-[15px] text-muted">{issue.body || 'No description.'}</p>
              <a href={issue.url} target="_blank" rel="noreferrer" className={`${buttonClass('secondary', 'sm')} mt-1 self-start text-muted no-underline hover:text-foreground`}>Open on GitHub<IconExternal size={14} /></a>
            </>
          ) : error ? null : (
            <ReportSkeleton />
          )}
        </Panel>

        <div className="flex min-w-0 flex-[1.2_1_420px] flex-col gap-[22px]">
          <label data-tour="who" className="flex flex-col gap-2">
            <span className="font-mono text-sm font-semibold">Who hit the bug?</span>
            <span className="text-[13px] text-subtle">Device, browser, language, location: whatever the report leaves out. The agent rebuilds this environment.</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={EXAMPLES[0]} className={`${field} resize-y border-purple-700 p-3 text-[15px] leading-normal`} />
            {isDemo ? (
              <span className="flex flex-col gap-1.5">
                <span className="font-mono text-xs text-subtle">Demo tickets: fill in what we know about that reporter</span>
                <span className="flex flex-wrap gap-1.5">
                  {DEMO_NOTES.map((d) => {
                    const current = d.issue === number;
                    const chosen = notes === d.notes;
                    return (
                      <button
                        key={d.issue}
                        data-tour={`note-${d.issue}`}
                        type="button"
                        onClick={() => setNotes(d.notes)}
                        aria-pressed={chosen}
                        className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors ${chosen ? 'border-purple-200 bg-purple-200 text-purple-950' : current ? 'border-hot/60 text-foreground hover:bg-purple-850' : 'border-purple-700 text-muted hover:bg-purple-850 hover:text-foreground'}`}
                      >
                        <span className={`font-semibold ${chosen ? '' : 'text-hot'}`}>#{d.issue}</span>
                        {d.label}
                      </button>
                    );
                  })}
                </span>
              </span>
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setNotes(ex)} className="rounded-sm border border-purple-700 px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:bg-purple-850 hover:text-foreground">
                    {ex.slice(0, 34)}…
                  </button>
                ))}
              </span>
            )}
          </label>

          <div data-tour="recording" className="flex flex-col gap-2">
            <span className="font-mono text-sm font-semibold">Screen recording or screenshot <span className="font-normal text-subtle">(optional)</span></span>
            <span className="text-[13px] text-subtle">The customer&apos;s recording of the bug. The agent watches it for the steps and for clues about their device and language.</span>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed bg-ink p-[18px] ${dragging ? 'border-hot bg-hot/5' : 'border-purple-700'}`}
            >
              <span className="text-sm text-muted">
                Drop a file or{' '}
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || media.length >= 3} className="text-purple-200 underline underline-offset-[3px] disabled:opacity-50">choose one</button>
                {uploading && <span className="ml-3 inline-flex items-center gap-2 font-mono text-xs text-cyan"><PixelDots />uploading</span>}
              </span>
              <span className="font-mono text-xs text-subtle">mp4 webm mov png jpg webp · 50 MB</span>
              <input ref={fileInput} type="file" accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            </div>
            {media.length > 0 && (
              <span className="flex flex-wrap gap-1.5">
                {media.map((m) => (
                  <span key={m.uri} className="inline-flex items-center gap-2 rounded-sm bg-purple-850 py-1 pr-1.5 pl-2.5 font-mono text-xs text-foreground">
                    {m.kind === 'video' ? 'Video' : 'Image'}: {m.label}
                    <button type="button" aria-label={`Remove ${m.label}`} onClick={() => setMedia((all) => all.filter((x) => x.uri !== m.uri))} className="grid size-5 place-items-center rounded-[4px] text-subtle transition-colors hover:bg-purple-700 hover:text-foreground"><IconX size={12} /></button>
                  </span>
                ))}
              </span>
            )}
          </div>

          <label data-tour="env" className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-sm font-semibold">Environment variables <span className="font-normal text-subtle">(optional)</span></span>
              <span className="rounded-sm bg-pass/10 px-[7px] py-0.5 font-mono text-[11px] font-medium tracking-[0.06em] text-pass">SANDBOX ONLY</span>
            </span>
            <span className="text-[13px] text-subtle">One KEY=value per line, if the app needs them to start.</span>
            <textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} spellCheck={false} placeholder="PORT=3000" className={`${field} resize-y border-purple-700 p-3 font-mono text-[13px] leading-relaxed`} />
            <span className="rounded-md border border-purple-800 bg-purple-900 px-3 py-2.5 text-[13px] text-muted">
              Sent to the sandbox only; never stored or logged. A run with environment variables always gets a fresh sandbox.
            </span>
          </label>

          <fieldset data-tour="depth" className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-sm font-semibold">How deep</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { value: true, title: 'Deep investigation', text: 'Reads the code, its history and the framework source, runs experiments in real browsers. Up to about 30 minutes.' },
                { value: false, title: 'Quick', text: 'One replay matrix, then a fix. About 5 minutes. For bugs with an obvious trigger.' },
              ].map((o) => (
                <label key={o.title} className={`flex cursor-pointer flex-col gap-1 rounded-md border px-3.5 py-3 ${deep === o.value ? 'border-purple-400 bg-purple-850' : 'border-purple-700 bg-ink hover:border-purple-500'}`}>
                  <span className="flex items-center gap-2 font-mono text-[13px] font-semibold">
                    <input type="radio" name="depth" checked={deep === o.value} onChange={() => setDeep(o.value)} className="accent-purple-400" data-testid={o.value ? 'depth-deep' : 'depth-quick'} />
                    {o.title}
                  </span>
                  <span className="text-[13px] text-subtle">{o.text}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <ErrorNote message={error} />}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button data-tour="investigate" onClick={start} disabled={busy || uploading || !issue} className={buttonClass('primary', 'lg')}>{busy ? <Busy>Starting</Busy> : <><IconSearch size={18} />Investigate</>}</button>
            <span className="max-w-[340px] text-[13px] text-subtle">{deep ? 'A deep run can take half an hour; the page shows every step live.' : 'A quick run takes a few minutes.'} Nothing is pushed to GitHub until you approve.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TicketForm() {
  const { owner, name, number } = useParams<{ owner: string; name: string; number: string }>();
  return <Shell>{() => <Form owner={owner} name={name} number={Number(number)} />}</Shell>;
}
