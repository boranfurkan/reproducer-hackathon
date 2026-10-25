'use client';

import { useState } from 'react';
import { IconPullRequest, IconX } from '../icons';
import { Busy } from '../loaders';
import Mascot from '../mascot/Mascot';
import { matrixCounts } from './MatrixTable';
import { Eyebrow, InlineCode, RunStatusChip, StatusChip, buttonClass } from '../ui';
import { TEST_FILE, ago, diffStats, splitDiff, type RunView, type SimilarFix } from '@/lib/client';
import { approveRun, rejectRun } from '@/lib/hooks';

export function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="m-0 max-h-80 overflow-auto rounded-md border border-purple-800 bg-code py-2.5 font-mono text-[13px] leading-[1.7] text-muted">
      {diff.split('\n').map((l, i) => {
        const add = l.startsWith('+') && !l.startsWith('+++');
        const del = l.startsWith('-') && !l.startsWith('---');
        const cls = add ? 'bg-pass/12 text-[#a6f3cd]' : del ? 'bg-fail/12 text-[#ffb3ab]' : l.startsWith('@@') ? 'text-[#b99aff]' : /^(diff --git|index |---|\+\+\+|new file)/.test(l) ? 'text-subtle' : '';
        return <span key={i} className={`block px-3.5 ${cls}`}>{l || ' '}</span>;
      })}
    </pre>
  );
}

/** A little colour for the keywords of the generated Playwright test. */
function TestCode({ code }: { code: string }) {
  return (
    <pre className="m-0 max-h-80 overflow-auto rounded-md border border-purple-800 bg-code px-3.5 py-3 font-mono text-[13px] leading-[1.7] text-muted">
      {code.split(/(\btest\b|\bexpect\b|\bawait\b|\basync\b|\bdescribe\b)/).map((part, i) => (i % 2 === 1 ? <span key={i} className="text-hot">{part}</span> : <span key={i}>{part}</span>))}
    </pre>
  );
}

/**
 * The visual high point of the run page. Nothing has been pushed to GitHub: the two buttons are the only way to continue.
 * After approval it becomes the link to the pull request; after rejection, a note that nothing was pushed.
 */
export default function ApprovalCard({ run, similar, onChange }: { run: RunView; similar: SimilarFix[]; onChange: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  async function act(kind: 'approve' | 'reject') {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'approve') await approveRun(run._id);
      else await rejectRun(run._id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (run.prUrl) {
    return (
      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-pass/40 bg-purple-900 p-5">
        <Mascot pose="found" size={88} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="self-start"><RunStatusChip run={run} /></span>
          <h2 className="font-mono text-xl font-semibold">{run.prState === 'merged' ? 'Merged: the fix is in.' : run.prState === 'closed' ? 'Closed without merging.' : 'Pull request opened'}</h2>
          <a href={run.prUrl} target="_blank" rel="noreferrer" className="font-mono text-sm [overflow-wrap:anywhere]">{run.prUrl}</a>
          <p className="font-mono text-xs text-subtle">
            {run.prState === 'merged' && run.prMergedAt ? `Merged ${ago(run.prMergedAt)} · ` : run.prState === 'closed' && run.prClosedAt ? `Closed ${ago(run.prClosedAt)} · ` : ''}
            {run.prReviews ? `${run.prReviews} review${run.prReviews === 1 ? '' : 's'}${run.prReviewState ? ` (${run.prReviewState.toLowerCase().replace('_', ' ')})` : ''} · ` : ''}
            {run.prComments ? `${run.prComments} comment${run.prComments === 1 ? '' : 's'} · ` : ''}
            {run.prState === 'merged' ? 'Memory now trusts this fix more.' : run.prState === 'closed' ? 'Memory now trusts this fix less.' : 'Watching for reviews, merge or close.'}
          </p>
        </div>
      </section>
    );
  }
  if (run.rejectedAt) {
    return (
      <section className="flex items-center gap-4 rounded-lg border border-purple-700 bg-purple-900 p-5">
        <Mascot pose="idle" size={72} />
        <div className="flex flex-col gap-1">
          <h2 className="font-mono text-lg font-semibold">Rejected</h2>
          <p className="text-sm text-muted">Nothing was pushed to GitHub.</p>
        </div>
      </section>
    );
  }

  const files = splitDiff(run.diff ?? '');
  const fixDiff = files.filter((f) => f.path !== TEST_FILE).map((f) => f.text).join('\n');
  const stats = diffStats(fixDiff);
  const other = new Set((run.otherProblems ?? []).map((o) => o.profile));
  const counts = matrixCounts(run.matrix ?? [], (r) => !other.has(r.name));
  const [owner, repoName] = run.repo.split('/');

  return (
    <section aria-labelledby="approval-title" className="overflow-hidden rounded-lg border border-hot bg-purple-900 shadow-[0_0_0_4px_rgba(255,121,198,0.08),0_24px_60px_-20px_rgba(255,121,198,0.25)]">
      <div className="flex flex-col gap-[22px] p-[clamp(18px,3vw,28px)]">
        <div className="flex flex-col gap-2">
          <span className="self-start"><StatusChip tone="waiting">Waiting for you</StatusChip></span>
          <h2 id="approval-title" className="font-mono text-[clamp(20px,3.2vw,26px)] leading-tight font-semibold tracking-[-0.015em]">Nothing has been pushed to GitHub.</h2>
          <p className="max-w-[620px] text-muted">Approving creates a branch and opens a pull request with this change and its test.</p>
        </div>

        {run.rootCause && (
          <div className="flex flex-col gap-2">
            <Eyebrow>Root cause</Eyebrow>
            <p className="text-base text-pretty"><InlineCode text={run.rootCause.rootCause} /></p>
            {run.rootCause.explanation && <p className="text-[15px] text-muted text-pretty"><InlineCode text={run.rootCause.explanation} /></p>}
            <span className="self-start rounded-sm bg-purple-850 px-2 py-0.5 font-mono text-xs text-purple-200">{run.rootCause.file}</span>
          </div>
        )}

        {fixDiff && (
          <div className="flex flex-col gap-2">
            <Eyebrow>Change · {stats.files} file{stats.files === 1 ? '' : 's'}, +{stats.added} −{stats.removed}</Eyebrow>
            <DiffBlock diff={fixDiff} />
          </div>
        )}

        {run.testContent && (
          <details open className="flex flex-col gap-2">
            <summary className="cursor-pointer font-mono text-xs font-medium tracking-[0.08em] text-subtle uppercase">New test · {TEST_FILE}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <TestCode code={run.testContent} />
              <div className="flex flex-wrap gap-2 font-mono text-xs font-medium">
                <span className="rounded-sm bg-fail/12 px-2 py-[3px] text-fail">before fix: fail</span>
                <span className="rounded-sm bg-pass/12 px-2 py-[3px] text-pass">after fix: pass</span>
                <span className="rounded-sm bg-pass/12 px-2 py-[3px] text-pass">existing tests: pass</span>
                {counts.total > 0 && <span className="rounded-sm bg-pass/12 px-2 py-[3px] text-pass">matrix: {counts.passed} of {counts.total}</span>}
              </div>
            </div>
          </details>
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3">
          <div className="flex flex-col gap-1.5 rounded-md border border-purple-800 bg-ink px-4 py-3.5">
            <Eyebrow>Could not be reproduced</Eyebrow>
            {run.profile?.notEmulated?.length ? (
              <ul className="list-disc pl-[18px] text-sm text-muted">{run.profile.notEmulated.map((n) => <li key={n}>{n}</li>)}</ul>
            ) : (
              <p className="text-sm text-muted">Nothing noted.</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 rounded-md border border-purple-800 bg-ink px-4 py-3.5">
            <Eyebrow>Similar past fixes</Eyebrow>
            {similar.length === 0 && <p className="text-sm text-muted">None yet.</p>}
            {similar.map((f) => (
              <div key={f.id} className="flex flex-col gap-0.5">
                <a href={`https://github.com/${f.repo}/issues/${f.issueNumber}`} target="_blank" rel="noreferrer" className="text-sm text-foreground no-underline hover:text-hot">{f.title}</a>
                <span className="font-mono text-xs text-subtle">{f.repo.split('/')[1]}#{f.issueNumber} · {f.file}{f.isolatedVariable ? ` · isolated by ${f.isolatedVariable}` : ''}{f.outcome && f.outcome !== 'open' ? ` · PR ${f.outcome}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-purple-700 bg-purple-850 px-[clamp(18px,3vw,28px)] py-[clamp(16px,3vw,22px)]">
        <Mascot pose="waiting" size={72} />
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
          <div className="flex flex-wrap gap-2.5">
            <button onClick={() => act('approve')} disabled={busy !== null} className={`${buttonClass('primary', 'lg')} max-w-[360px] flex-[1_1_auto] focus-visible:outline-hot`}>
              {busy === 'approve' ? <Busy>Opening pull request</Busy> : <><IconPullRequest />Approve and open pull request</>}
            </button>
            <button onClick={() => act('reject')} disabled={busy !== null} className={buttonClass('danger', 'lg')}>{busy === 'reject' ? <Busy>Rejecting</Busy> : <><IconX />Reject</>}</button>
          </div>
          {error && <p role="alert" className="text-[13px] text-fail">{error}</p>}
          <span className="font-mono text-xs text-muted [overflow-wrap:anywhere]">Opens a pull request on {owner}/{repoName} from a new branch (reproducer/issue-{run.issueNumber}-…).</span>
        </div>
      </div>
    </section>
  );
}
