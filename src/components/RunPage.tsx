'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import Mascot from './mascot/Mascot';
import ApprovalCard from './run/ApprovalCard';
import ReplyDraft from './run/ReplyDraft';
import RevisionPanel from './run/RevisionPanel';
import Timeline from './run/Timeline';
import { Busy, RunPageSkeleton } from './loaders';
import Shell from './Shell';
import { IconRefresh, IconStop } from './icons';
import { BackLink, ErrorNote, Eyebrow, InlineCode, Panel, PixelDots, RunStatusChip, buttonClass } from './ui';
import { formatClock, formatDuration, kilo, type RunView, type TimelineEvent } from '@/lib/client';
import { stopRun, useNow, useRun } from '@/lib/hooks';

/** The steps of an investigation in the order they happen, for the "now" panel: [label, the event that completes it, what it is doing]. */
const STEPS: [string, string, string][] = [
  ['Read the report', 'understood', 'Reading the report'],
  ['Rebuilt the environment', 'profile', 'Rebuilding the environment'],
  ['Replay matrix', 'matrix', 'Running the matrix'],
  ['Checked memory', 'memory', 'Checking memory'],
  ['Root cause', 'root_cause', 'Finding the root cause'],
  ['Test fails before the fix', 'test_written', 'Writing the failing test'],
  ['Fix', 'fix_attempt', 'Fixing the code'],
  ['Tests pass', 'green', 'Checking the fix'],
];

/** The deep investigation adds a step after the matrix. */
const stepsFor = (run: RunView): [string, string, string][] =>
  run.mode === 'deep' ? [...STEPS.slice(0, 3), ['Deep investigation', 'concluded', 'Investigating in depth'], ...STEPS.slice(3)] : STEPS;

/** Live counters of a deep investigation, from its timeline events. */
function deepCounters(events: TimelineEvent[]) {
  const steps = events.filter((e) => e.type === 'deep_step').map((e) => (e.data as { tool?: string; contextTokens?: number } | undefined) ?? {});
  return {
    experiments: events.filter((e) => e.type === 'experiment').length,
    reads: steps.filter((d) => d.tool === 'read').length,
    searches: steps.filter((d) => d.tool === 'search' || d.tool === 'web').length,
    context: Math.max(0, ...steps.map((d) => d.contextTokens ?? 0)),
  };
}

function NowPanel({ run, events }: { run: RunView; events: TimelineEvent[] }) {
  const now = useNow(true);
  const STEPS = stepsFor(run);
  const seen = new Set(events.map((e) => e.type));
  const deep = run.mode === 'deep' ? deepCounters(events) : null;
  const current = STEPS.findIndex(([, type]) => !seen.has(type));
  const at = current === -1 ? STEPS.length - 1 : current;
  const elapsed = now - new Date(run.createdAt).getTime();
  return (
    <Panel className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3.5">
        <Mascot pose="investigating" size={80} />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs font-medium tracking-[0.08em] text-cyan">NOW</span>
          <span className="font-mono text-base font-semibold">{STEPS[at][2]}</span>
          <span className="text-[13px] text-subtle">{STEPS[at][1] === 'matrix' ? 'The same replay under several environments, in Chromium and WebKit.' : 'Each step appears on the timeline as soon as it is done.'}</span>
        </div>
      </div>
      {run.thinking?.text && (
        <div className="flex flex-col gap-1.5 rounded-md border border-cyan/25 bg-cyan/5 px-3 py-2.5" aria-live="off">
          <span className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.08em] text-cyan"><PixelDots />ARGON IS THINKING · {run.thinking.step.toUpperCase()}</span>
          <p className="max-h-32 overflow-hidden text-[13px] leading-snug text-muted [mask-image:linear-gradient(to_bottom,transparent,black_35%)]">{run.thinking.text.slice(-420)}</p>
        </div>
      )}
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[13px]">
        {STEPS.map(([label, type], i) => {
          const done = seen.has(type);
          const isNow = i === at && !done;
          return (
            <li key={label} className={`flex items-center gap-2.5 ${done ? 'text-muted' : isNow ? 'font-semibold text-foreground' : 'text-faint'}`}>
              <span className={`size-2 ${done ? 'bg-pass' : isNow ? 'border-2 border-cyan' : 'border border-dashed border-faint'}`} aria-hidden="true" />
              {label}
            </li>
          );
        })}
      </ol>
      {deep && seen.has('matrix') && (
        <div className="grid grid-cols-4 gap-2 border-t border-purple-800 pt-3 font-mono text-xs text-subtle">
          <span>Context<br /><b className="text-[15px] text-foreground">{deep.context ? `${kilo(deep.context)}` : '–'}</b></span>
          <span>Experiments<br /><b className="text-[15px] text-foreground">{deep.experiments}</b></span>
          <span>Files read<br /><b className="text-[15px] text-foreground">{deep.reads}</b></span>
          <span>Searches<br /><b className="text-[15px] text-foreground">{deep.searches}</b></span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 border-t border-purple-800 pt-3 font-mono text-xs text-subtle">
        <span>Tokens<br /><b className="text-[15px] text-foreground">{kilo(run.tokensUsed ?? 0) || '0'}</b> {run.tokenCap ? <span>of {kilo(run.tokenCap)} cap</span> : null}</span>
        <span>Elapsed<br /><b className="text-[15px] text-foreground">{formatClock(elapsed)}</b> <span>{run.mode === 'deep' ? 'deep runs take up to 30 min' : 'usually 4 to 5 min'}</span></span>
      </div>
    </Panel>
  );
}

function StoppedPanel({ run, owner, repo }: { run: RunView; owner: string; repo: string }) {
  const title = run.status === 'not_reproduced' ? 'Could not reproduce' : run.status === 'stopped' ? 'Stopped' : run.status === 'no_fix' ? 'No verified fix' : 'Something went wrong';
  const tryAgain = `/repos/${owner}/${repo}/issues/${run.issueNumber}${run.notes ? `?notes=${encodeURIComponent(run.notes)}` : ''}`;
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-purple-700 bg-purple-900 p-[clamp(18px,3vw,26px)]">
      <div className="flex flex-wrap items-center gap-4">
        <Mascot pose="failed" size={112} />
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <h2 className="font-mono text-xl font-semibold">{title}</h2>
          <p className="text-muted">The agent stopped without a verified fix and has not changed anything.</p>
        </div>
      </div>
      {run.reason && <p className="rounded-md border border-purple-800 bg-ink px-3.5 py-3 text-[15px]"><InlineCode text={run.reason} /></p>}
      {run.suggestions && run.suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Eyebrow>Detail that would help</Eyebrow>
          <ul className="m-0 flex list-disc flex-col gap-0.5 pl-[18px] text-sm text-muted">{run.suggestions.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <Link href={tryAgain} className={`${buttonClass('primary', 'md')} self-start no-underline`}><IconRefresh />Try again with more detail</Link>
    </section>
  );
}

function Run({ id, user }: { id: string; user: Parameters<typeof Timeline>[0]['user'] }) {
  const { run, events, similar, error, reload } = useRun(id);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState('');
  const running = run?.status === 'running';
  const now = useNow(running);

  if (error && !run) return <ErrorNote message={error} />;
  if (!run) return <RunPageSkeleton />;
  const [owner, repo] = run.repo.split('/');
  const waiting = run.status === 'fixed' && !run.rejectedAt;
  const done = !running;
  const attempts = events.filter((e) => e.type === 'fix_attempt').length;
  const elapsed = (done && run.finishedAt ? new Date(run.finishedAt).getTime() : now) - new Date(run.createdAt).getTime();
  const p = run.profile;
  const envLine = p ? [p.engine, p.locale, p.timezoneId, p.viewport ? `${p.viewport.width}×${p.viewport.height}` : '', run.decisiveVariables?.length && run.status === 'fixed' ? `isolated: ${run.decisiveVariables.join(', ')}` : ''].filter(Boolean).join(' · ') : '';

  async function stop() {
    setStopping(true);
    setStopError('');
    try {
      await stopRun(id);
    } catch (e) {
      setStopError((e as Error).message);
      setStopping(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <BackLink href={`/repos/${owner}/${repo}`}>{run.repo}</BackLink>
        <h1 className="font-mono text-[clamp(20px,3vw,28px)] leading-tight font-semibold tracking-[-0.02em] text-balance"><span className="text-hot">#{run.issueNumber}</span> {run.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <RunStatusChip run={run} />
          <span className="flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-xs text-muted">
            <span>{done ? `Took ${formatDuration(elapsed)}` : `${formatDuration(elapsed)} so far`}</span>
            {run.tokensUsed ? <span>{kilo(run.tokensUsed)} tokens</span> : null}
            <span>{attempts > 0 ? (running ? `attempt ${attempts} of 3` : `${attempts} fix attempt${attempts === 1 ? '' : 's'}`) : done ? 'no fix attempted' : ''}</span>
          </span>
          {running && (
            <button onClick={stop} disabled={stopping || run.stopRequested} className={`${buttonClass('danger', 'sm')} ml-auto`}>
              {stopping || run.stopRequested ? <Busy>Stopping after this step</Busy> : <><IconStop size={14} />Stop run</>}
            </button>
          )}
        </div>
        {stopError && <ErrorNote message={stopError} />}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[1.1_1_440px]">
          <Timeline run={run} events={events} user={user} running={running} />
        </div>
        {/* When a fix is waiting for approval it comes first on a narrow screen: the decision is the point of the page. */}
        <aside className={`flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 ${waiting ? 'order-first flex-[1_1_460px] lg:order-none' : 'flex-[0.8_1_340px]'}`}>
          {waiting && <ApprovalCard run={run} similar={similar} onChange={reload} />}
          {run.status === 'fixed' && (run.prUrl || run.rejectedAt) && !waiting && <ApprovalCard run={run} similar={similar} onChange={reload} />}
          {run.prUrl && <RevisionPanel run={run} onChange={reload} />}
          {running && <NowPanel run={run} events={events} />}
          {done && run.status !== 'fixed' && <StoppedPanel run={run} owner={owner} repo={repo} />}
          {run.status === 'not_reproduced' && <ReplyDraft run={run} onChange={reload} />}
          {run.otherProblems && run.otherProblems.length > 0 && (
            <Panel className="flex flex-col gap-2 px-[18px] py-4">
              <Eyebrow>Other problems noticed</Eyebrow>
              <p className="text-[13px] text-subtle">Not part of this issue, and left alone. They look like separate bugs.</p>
              {run.otherProblems.map((o) => (
                <p key={o.profile} className="text-sm"><code className="rounded-[4px] bg-purple-850 px-1.5 py-px font-mono text-xs text-purple-200">{o.profile.replace(/^add-/, 'reporter + ')}</code> {o.problem}</p>
              ))}
            </Panel>
          )}
          {envLine && (
            <Panel className="flex flex-col gap-2 px-[18px] py-4">
              <Eyebrow>Reporter environment</Eyebrow>
              <p className="font-mono text-[13px] leading-relaxed">{envLine}</p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  return <Shell>{(user) => <Run id={id} user={user} />}</Shell>;
}
