import type { MatrixRow } from '@/lib/client';

const ENGINE_ORDER = ['chromium', 'webkit', 'firefox'];

/** The engines that have a column, in a stable order. Older runs have no per-engine results: one "result" column then. */
function columnsOf(rows: MatrixRow[]): string[] {
  const set = new Set<string>();
  rows.forEach((r) => Object.keys(r.engines ?? {}).forEach((e) => set.add(e)));
  return set.size ? ENGINE_ORDER.filter((e) => set.has(e)) : ['result'];
}

/** What went wrong in a failing row, in a short line: the console error if there is one, else the failed step. */
function detailOf(r: MatrixRow): string {
  if (r.ok) return '';
  const raw = r.errors?.[0] || r.failure || 'fails';
  return raw.replace(/locator\.\w+:\s*/, '').replace(/Timeout \d+ms exceeded\.?/, 'timed out').slice(0, 140);
}

function Cell({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) return <span className="font-mono text-xs text-faint">·</span>;
  return ok ? (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-pass"><span className="size-2 bg-pass" aria-hidden="true" />pass</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-fail"><span className="size-2 bg-fail" aria-hidden="true" />fail</span>
  );
}

/** How many replays passed, counting every engine: "12 of 12". Optionally only some rows (the ones that belong to the issue). */
export function matrixCounts(rows: MatrixRow[], only?: (r: MatrixRow) => boolean): { passed: number; total: number } {
  let passed = 0;
  let total = 0;
  rows.filter((r) => !only || only(r)).forEach((r) => {
    const cells = Object.values(r.engines ?? {});
    if (cells.length) cells.forEach((c) => { total++; if (c.ok) passed++; });
    else { total++; if (r.ok) passed++; }
  });
  return { passed, total };
}

/**
 * The replay matrix: a row per environment, a column per engine. `isolated` names the rows that isolate the cause (highlighted);
 * `isolatedLabel` is the variable ("locale"); `added` says the cause was an extra condition rather than something the reporter has.
 * `otherRows` are rows that fail for a different reason (another bug in the repository): labelled, and not counted against this fix.
 */
export default function MatrixTable({ rows, isolated = [], isolatedLabel, added = false, otherRows = [], afterFix = false }: { rows: MatrixRow[]; isolated?: string[]; isolatedLabel?: string; added?: boolean; otherRows?: string[]; afterFix?: boolean }) {
  const cols = columnsOf(rows);
  const grid = { gridTemplateColumns: `minmax(0,1fr) ${cols.map(() => '64px').join(' ')}` };
  const allPass = rows.length > 0 && rows.every((r) => r.ok);
  return (
    <div className="flex flex-col gap-2.5">
      <div role="table" aria-label="Replay matrix" className="overflow-hidden rounded-md border border-purple-800 bg-ink">
        <div role="row" className="grid gap-2 border-b border-purple-800 px-3 py-2 font-mono text-[11px] font-medium tracking-[0.08em] text-subtle" style={grid}>
          <span role="columnheader">PROFILE</span>
          {cols.map((c) => <span key={c} role="columnheader">{c.toUpperCase()}</span>)}
        </div>
        {rows.map((r) => {
          const iso = isolated.includes(r.name);
          const detail = detailOf(r);
          const other = otherRows.includes(r.name);
          return (
            <div key={r.name} role="row" className="relative grid items-center gap-2 border-t border-[#1d1240] px-3 py-[9px]" style={grid}>
              {iso && <span aria-hidden="true" className="pointer-events-none absolute -inset-px rounded-[4px] border-2 border-hot bg-hot/7" />}
              <span role="cell" className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-mono text-[13px] font-semibold">{r.name.replace(/^reset-/, 'reporter − ').replace(/^add-/, 'reporter + ')}</span>
                  {r.kind && <span className="font-mono text-xs text-subtle">{r.kind}</span>}
                  {other && <span className="rounded-sm bg-amber/12 px-1.5 py-px font-mono text-[11px] font-medium text-amber">separate bug</span>}
                </span>
                {(r.kind === 'neutral' ? r.env : r.change || r.env) && <span className="font-mono text-xs text-muted [overflow-wrap:anywhere]">{r.kind === 'neutral' ? r.env : r.change || r.env}</span>}
                {detail && <span className={`text-[13px] ${other ? 'text-amber' : 'text-fail'}`}>{detail}</span>}
              </span>
              {cols.map((c) => (
                <span key={c} role="cell"><Cell ok={c === 'result' ? r.ok : r.engines?.[c]?.ok} /></span>
              ))}
            </div>
          );
        })}
      </div>
      {isolatedLabel && (
        <div className="flex flex-wrap items-baseline gap-2 text-sm text-muted">
          <span className="rounded-sm bg-hot px-2 py-0.5 font-mono text-xs font-semibold text-purple-950">isolated: {isolatedLabel}</span>
          <span>{added ? `Adding ${isolatedLabel} to the reporter's profile reproduces the bug.` : `Resetting only the ${isolatedLabel} makes the reporter's profile pass.`}</span>
        </div>
      )}
      {/* All green after a fix is the goal, not a failure to isolate. */}
      {!isolatedLabel && allPass && !afterFix && (
        <div className="flex flex-wrap items-baseline gap-2 text-sm text-muted">
          <span className="rounded-sm bg-purple-850 px-2 py-0.5 font-mono text-xs font-semibold text-amber">nothing isolated</span>
          <span>Every profile passes. The difference is something this matrix did not vary.</span>
        </div>
      )}
    </div>
  );
}
