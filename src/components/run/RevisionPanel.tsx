'use client';

import { useState } from 'react';
import { Busy } from '../loaders';
import Mascot from '../mascot/Mascot';
import { ErrorNote, Eyebrow, Panel, PixelDots, StatusChip, buttonClass } from '../ui';
import { DiffBlock } from './ApprovalCard';
import { diffStats, splitDiff, TEST_FILE, type RunView } from '@/lib/client';
import { reviseRun } from '@/lib/hooks';

/**
 * After the pull request is open: reviewers comment, ReProducer revises the fix (verified like the first one), and the developer decides
 * whether to push it to the branch. Starting a revision pushes nothing; the push is its own click.
 */
export default function RevisionPanel({ run, onChange }: { run: RunView; onChange: () => void }) {
  const [busy, setBusy] = useState<'start' | 'push' | 'discard' | null>(null);
  const [error, setError] = useState('');
  const rev = run.revision;
  const open = run.prState === undefined || run.prState === 'open';
  const hasFeedback = (run.prReviews ?? 0) + (run.prComments ?? 0) > 0;

  async function act(action: 'start' | 'push' | 'discard') {
    setBusy(action);
    setError('');
    try {
      await reviseRun(run._id, action);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!run.prUrl || !open) return null;

  if (rev?.status === 'running') {
    return (
      <Panel className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3.5">
          <Mascot pose="investigating" size={72} />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-medium tracking-[0.08em] text-cyan">REVISING THE FIX</span>
            <span className="text-sm text-muted">Answering {rev.feedbackCount} reviewer comment{rev.feedbackCount === 1 ? '' : 's'}. Nothing is pushed until you say so.</span>
          </div>
        </div>
        {run.thinking?.text && (
          <div className="flex flex-col gap-1.5 rounded-md border border-cyan/25 bg-cyan/5 px-3 py-2.5">
            <span className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.08em] text-cyan"><PixelDots />ARGON IS THINKING</span>
            <p className="max-h-28 overflow-hidden text-[13px] leading-snug text-muted [mask-image:linear-gradient(to_bottom,transparent,black_35%)]">{run.thinking.text.slice(-380)}</p>
          </div>
        )}
      </Panel>
    );
  }

  if (rev?.status === 'ready') {
    const fixDiff = splitDiff(rev.diff ?? '').filter((f) => f.path !== TEST_FILE).map((f) => f.text).join('\n');
    const stats = diffStats(fixDiff);
    return (
      <section className="overflow-hidden rounded-lg border border-hot bg-purple-900 shadow-[0_0_0_4px_rgba(255,121,198,0.08)]">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-2">
            <span className="self-start"><StatusChip tone="waiting">Revision ready</StatusChip></span>
            <h2 className="font-mono text-lg font-semibold">{rev.summary}</h2>
            <p className="text-sm text-muted">Verified like the first fix: the test fails before it and passes after it{rev.matrixTotal ? `, ${rev.matrixPassed} of ${rev.matrixTotal} required profiles pass` : ''}. Nothing has been pushed.</p>
          </div>
          {rev.reply && (
            <div className="flex flex-col gap-1.5 rounded-md border border-purple-800 bg-ink px-3.5 py-3">
              <Eyebrow>Your reply to the reviewer</Eyebrow>
              <p className="text-sm text-pretty">{rev.reply}</p>
            </div>
          )}
          {fixDiff && (
            <div className="flex flex-col gap-2">
              <Eyebrow>Change now · {stats.files} file{stats.files === 1 ? '' : 's'}, +{stats.added} −{stats.removed}</Eyebrow>
              <DiffBlock diff={fixDiff} />
            </div>
          )}
          {error && <ErrorNote message={error} />}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-purple-700 bg-purple-850 px-5 py-4">
          <button onClick={() => act('push')} disabled={busy !== null} className={buttonClass('primary', 'md')}>{busy === 'push' ? <Busy>Pushing</Busy> : 'Push to the pull request'}</button>
          <button onClick={() => act('discard')} disabled={busy !== null} className={buttonClass('danger', 'md')}>{busy === 'discard' ? <Busy>Discarding</Busy> : 'Discard'}</button>
          <span className="text-[13px] text-subtle">Adds a commit to the branch and posts the reply.</span>
        </div>
      </section>
    );
  }

  if (rev?.status === 'pushed' && !hasFeedback) return null;

  if (!hasFeedback && rev?.status !== 'failed') return null;

  return (
    <Panel className="flex flex-col gap-3 px-[18px] py-4">
      <Eyebrow>Review feedback</Eyebrow>
      {rev?.status === 'pushed' && <p className="text-sm text-pass">Revision pushed{rev.commitUrl ? <> · <a href={rev.commitUrl} target="_blank" rel="noreferrer">commit</a></> : null}.</p>}
      {rev?.status === 'failed' && <ErrorNote message={rev.reason ?? 'The revision failed.'} />}
      <p className="text-sm text-muted">
        {run.prReviews ? `${run.prReviews} review${run.prReviews === 1 ? '' : 's'}` : ''}{run.prReviews && run.prComments ? ' and ' : ''}{run.prComments ? `${run.prComments} comment${run.prComments === 1 ? '' : 's'}` : ''} on the pull request.
        ReProducer can revise the fix to answer them and verify it again before anything is pushed.
      </p>
      {error && <ErrorNote message={error} />}
      <button onClick={() => act('start')} disabled={busy !== null || (run.revisions ?? 0) >= 3} className={`${buttonClass('primary', 'md')} self-start`}>{busy === 'start' ? <Busy>Starting</Busy> : 'Address review feedback'}</button>
    </Panel>
  );
}
