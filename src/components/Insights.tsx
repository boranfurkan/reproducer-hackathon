'use client';

import { Loading, Skeleton } from './loaders';
import Shell from './Shell';
import { BackLink, Eyebrow, Panel, RunStatusChip } from './ui';
import { formatDuration, kilo } from '@/lib/client';
import { useInsights } from '@/lib/hooks';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel className="flex flex-col gap-1 px-[18px] py-4">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-mono text-2xl font-semibold">{value}</span>
      {sub && <span className="text-[13px] text-subtle">{sub}</span>}
    </Panel>
  );
}

function Body() {
  const data = useInsights();
  if (!data) {
    return (
      <Loading label="Loading insights" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
        <Skeleton className="h-56 rounded-lg" />
      </Loading>
    );
  }
  const { totals, daily, byStatus, byVariable, pullRequests } = data;
  const maxTokens = Math.max(1, ...daily.map((d) => d.tokens));
  const maxFix = Math.max(1, ...byVariable.map((v) => v.fixes));
  return (
    <div className="flex flex-col gap-6">
      <div data-tour="insights" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Investigations" value={String(totals.runs)} sub={`${totals.fixed} with a verified fix`} />
        <Stat label="Tokens used" value={kilo(totals.tokens) || '0'} sub={totals.fixed ? `${kilo(totals.avgTokensPerFix)} per fix on average` : undefined} />
        <Stat label="Time to a fix" value={totals.fixed ? formatDuration(totals.avgSecondsPerFix * 1000) : '–'} sub="average, start to verified" />
        <Stat label="Pull requests" value={String(totals.pullRequests)} sub={`${totals.merged} merged · ${totals.closed} closed`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="flex min-w-0 flex-col gap-3 p-[18px]">
          <h2 className="font-mono text-[15px] font-semibold">Activity by day</h2>
          {daily.length === 0 && <p className="text-sm text-muted">No investigations yet.</p>}
          <div className="flex flex-col gap-2 font-mono text-[13px]">
            {daily.map((d) => (
              <div key={d.day} className="grid grid-cols-[84px_1fr_auto] items-center gap-3">
                <span className="text-subtle">{d.day.slice(5)}</span>
                <span className="h-2 bg-purple-400" style={{ width: `${(d.tokens / maxTokens) * 100}%` }} />
                <span className="text-right text-muted">{d.runs} run{d.runs === 1 ? '' : 's'} · {d.fixed} fixed · {kilo(d.tokens)} <span className="text-faint">(total {kilo(d.tokensTotal)})</span></span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="flex min-w-0 flex-col gap-3 p-[18px]">
          <h2 className="font-mono text-[15px] font-semibold">What isolated the bugs</h2>
          {byVariable.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
          <div className="flex flex-col gap-2 font-mono text-[13px]">
            {byVariable.map((v) => (
              <div key={v.variable} className="grid grid-cols-[110px_1fr_auto] items-center gap-2.5">
                <span className="truncate" title={v.variable}>{v.variable.replace(/ \(added.*\)$/, '')}</span>
                <span className="h-2 bg-hot" style={{ width: `${(v.fixes / maxFix) * 100}%` }} />
                <span className="text-right text-subtle">{v.fixes}{v.merged ? ` · ${v.merged} merged` : ''}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-purple-800 pt-3 font-mono text-xs text-muted">
            {byStatus.map((s) => <span key={s.status}>{s.status.replace('_', ' ')} <b className="text-foreground">{s.runs}</b> · {kilo(s.avgTokens)} avg</span>)}
          </div>
        </Panel>
      </div>

      <Panel className="flex flex-col gap-3 p-[18px]">
        <h2 className="font-mono text-[15px] font-semibold">Pull requests</h2>
        {pullRequests.length === 0 && <p className="text-sm text-muted">No pull request opened yet. Approve a fix to open one.</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {pullRequests.map((p) => (
            <li key={`${p.run}-${p.prNumber}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-800 pb-2 last:border-0 last:pb-0">
              <span className="min-w-0 text-sm"><span className="font-mono font-semibold">{p.run}</span> · PR #{p.prNumber} <span className="text-muted">{p.title}</span></span>
              <span className="flex items-center gap-3 font-mono text-xs text-subtle">
                {p.reviews > 0 && <span>{p.reviews} review{p.reviews === 1 ? '' : 's'}</span>}
                {p.revised && <span className="text-pass">revised</span>}
                <RunStatusChip run={{ status: 'fixed', prUrl: 'x', prState: p.state as 'open' | 'merged' | 'closed' }} />
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export default function Insights() {
  return (
    <Shell>
      {() => (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <BackLink href="/">Repositories</BackLink>
            <h1 className="font-mono text-[clamp(22px,3vw,28px)] leading-tight font-semibold tracking-[-0.02em]">Insights</h1>
            <p className="text-sm text-muted">What ReProducer has done for you, and what it cost. Computed in MongoDB.</p>
          </div>
          <Body />
        </div>
      )}
    </Shell>
  );
}
