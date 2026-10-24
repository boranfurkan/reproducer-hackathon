import Mascot from '../mascot/Mascot';
import type { Pose } from '../mascot/pixels';
import MatrixTable, { matrixCounts } from './MatrixTable';
import { Chip, PixelDots, UserTile } from '../ui';
import { initials, type MatrixRow, type RunView, type SessionUser, type TimelineEvent } from '@/lib/client';

/** One entry of the timeline, as a chat-like message from the agent (or from you). */
interface Entry {
  id: string;
  who: 'you' | 'agent' | 'note';
  label: string;
  t: string;
  summary: string;
  pose?: Pose;
  tone?: 'default' | 'live' | 'pass' | 'fail';
  chips?: string[];
  attach?: string[];
  sources?: { title: string; url: string }[];
  proof?: { code: string; output: string };
  observ?: { title: string; text: string; moments?: { at: string; what: string }[] };
  list?: { title: string; sub: string }[];
  matrix?: { rows: MatrixRow[]; after: boolean };
  out?: { text: string; tone: 'fail' | 'pass' };
}

const secs = (ms: number) => `${Math.round(ms / 1000)}s`;
const firstLine = (s: string) => s.split('\n')[0];

/** Turns the stored events into timeline entries. Events with no use on their own (the approval request) are left out. */
export function buildEntries(run: RunView, events: TimelineEvent[], user: SessionUser): Entry[] {
  const out: Entry[] = [];
  const hasImage = (run.attachments ?? []).some((a) => a.kind === 'image');
  out.push({
    id: 'you',
    who: 'you',
    label: 'You',
    t: '0s',
    summary: run.notes?.trim() || 'No notes about the reporter.',
    attach: (run.attachments ?? []).map((a) => `${a.kind === 'video' ? 'Video' : 'Image'}: ${a.name}`),
  });
  const device = events.find((e) => e.type === 'hypothesis' && e.summary.startsWith('Device catalog matches:'));
  let fixes = 0;
  let matrices = 0;
  for (const e of events) {
    const base = { id: String(e.seq), t: secs(e.atMs) };
    const line = firstLine(e.summary);
    switch (e.type) {
      case 'boot':
        out.push({ ...base, who: 'note', label: 'Sandbox', summary: line });
        break;
      case 'understood': {
        const data = e.data as { mediaObservations?: string; mediaMoments?: { at: string; what: string }[] } | undefined;
        const media = data?.mediaObservations?.trim();
        out.push({ ...base, who: 'agent', label: 'Read the report', summary: line, ...(media ? { observ: { title: hasImage && !(run.attachments ?? []).some((a) => a.kind === 'video') ? 'What the screenshot shows' : 'What the recording shows', text: media, moments: data?.mediaMoments?.filter((m) => m.at && m.what).slice(0, 6) } } : {}) });
        break;
      }
      case 'profile': {
        const p = e.data as { engine?: string; viewport?: { width: number; height: number }; deviceScaleFactor?: number; locale?: string; timezoneId?: string; hasTouch?: boolean; storageBlocked?: boolean } | undefined;
        const chips = p
          ? [p.engine, p.viewport ? `${p.viewport.width}×${p.viewport.height}${p.deviceScaleFactor && p.deviceScaleFactor !== 1 ? ` @${p.deviceScaleFactor}x` : ''}` : '', p.locale, p.timezoneId, p.hasTouch ? 'touch' : '', p.storageBlocked ? 'storage blocked' : ''].filter(Boolean) as string[]
          : [];
        const matched = device ? device.summary.replace('Device catalog matches: ', '').split(', ')[0] : '';
        out.push({ ...base, who: 'agent', label: 'Rebuilt the environment', summary: matched ? `Matched “${matched}” in the device catalog.` : 'Rebuilt from the report and your notes.', chips });
        break;
      }
      case 'hypothesis':
        if (e.summary.startsWith('Device catalog matches:')) break; // shown on the environment entry
        out.push({ ...base, who: 'note', label: 'Hypothesis', summary: line });
        break;
      case 'memory': {
        const hits = Array.isArray(e.data) ? (e.data as { title: string; file: string; isolatedVariable: string }[]) : [];
        out.push({ ...base, who: 'agent', label: 'Memory', summary: hits.length ? 'Seen something similar before.' : line, list: hits.map((h) => ({ title: h.title, sub: `isolated by ${h.isolatedVariable}, ${h.file}` })) });
        break;
      }
      case 'matrix': {
        const rows = Array.isArray(e.data) ? (e.data as MatrixRow[]) : [];
        const after = matrices++ > 0 || line.startsWith('Matrix after');
        out.push({ ...base, who: 'agent', label: after ? 'Matrix after the fix' : 'Replay matrix', summary: after ? 'The same replay again, with the fix applied.' : `The same replay under ${rows.length} profiles, in every engine.`, matrix: { rows, after } });
        break;
      }
      case 'root_cause':
        out.push({ ...base, who: 'agent', label: 'Root cause', summary: line });
        break;
      case 'test_written': {
        const red = /red as required/.test(e.summary);
        out.push({ ...base, who: 'agent', label: 'Test fails before the fix', summary: red ? 'The new test fails on the reporter profile, as it should.' : line, ...(typeof e.data === 'string' && e.data.trim() ? { out: { text: e.data.trim(), tone: 'fail' as const } } : {}) });
        break;
      }
      case 'fix_attempt':
        fixes++;
        out.push({ ...base, who: 'agent', label: `Fix attempt ${fixes}`, summary: line.replace(/^Attempt \d+:\s*/, '') });
        break;
      case 'green': {
        const last = [...out].reverse().find((x) => x.matrix)?.matrix?.rows ?? [];
        const c = matrixCounts(last, (r) => !(run.otherProblems ?? []).some((o) => o.profile === r.name));
        out.push({ ...base, who: 'agent', label: 'Tests pass', summary: 'The new test passes, the existing tests pass, the matrix is green.', pose: 'found', tone: 'pass', ...(c.total ? { out: { text: `✔ tests pass   matrix ${c.passed} of ${c.total}`, tone: 'pass' as const } } : {}) });
        break;
      }
      case 'revision':
        out.push({ ...base, who: 'agent', label: 'Revision', summary: line, tone: /failed/i.test(line) ? 'fail' : /verified|pushed/i.test(line) ? 'pass' : undefined });
        break;
      case 'explained': {
        const d = e.data as { sources?: { title: string; url: string }[]; proof?: { code: string; output: string } } | undefined;
        out.push({ ...base, who: 'agent', label: 'Why this happens', summary: line, sources: d?.sources, proof: d?.proof });
        break;
      }
      case 'pr_update':
        out.push({ ...base, who: 'agent', label: 'Pull request', summary: line, tone: /merged/i.test(line) ? 'pass' : /closed/i.test(line) ? 'fail' : undefined });
        break;
      case 'pr_opened':
        out.push({ ...base, who: 'agent', label: 'Pull request opened', summary: line, tone: 'pass' });
        break;
      case 'stopped':
        out.push({ ...base, who: 'agent', label: 'Stopped', summary: line, pose: 'failed', tone: 'fail' });
        break;
      default:
        break; // approval_requested: the approval card says it
    }
  }
  void user;
  return out;
}

const cardTone = {
  default: { box: 'border-purple-800 bg-purple-900', label: 'text-purple-200' },
  live: { box: 'border-cyan/35 bg-cyan/5', label: 'text-cyan' },
  pass: { box: 'border-purple-800 bg-purple-900', label: 'text-pass' },
  fail: { box: 'border-purple-800 bg-purple-900', label: 'text-fail' },
};

/** The live timeline: chat-like entries from the agent, with your request first. The current step carries the mascot while running. */
export default function Timeline({ run, events, user, running }: { run: RunView; events: TimelineEvent[]; user: SessionUser; running: boolean }) {
  const entries = buildEntries(run, events, user);
  const lastAgent = [...entries].reverse().find((e) => e.who === 'agent')?.id;
  const isolated = run.isolatedRows ?? [];
  const label = run.decisiveVariables?.join(' + ');
  const added = isolated.some((n) => n.startsWith('add-'));
  return (
    <ol aria-label="Timeline" className="relative m-0 flex min-w-0 list-none flex-col gap-[18px] p-0">
      <span aria-hidden="true" className="absolute top-5 bottom-5 left-[15px] w-0.5 bg-[repeating-linear-gradient(#2a1a52_0_4px,transparent_4px_8px)]" />
      {entries.map((e) => {
        if (e.who === 'note') {
          return (
            <li key={e.id} className="relative flex items-start gap-3.5 pl-[7px]">
              <span className="relative z-[1] mt-1.5 flex w-[18px] justify-center"><span className="size-1.5 bg-purple-700" /></span>
              <div className="min-w-0 flex-1 py-0.5 font-mono text-xs text-subtle">
                <span className="text-faint">{e.label} · {e.t}</span> {e.summary.length > 200 ? `${e.summary.slice(0, 200)}…` : e.summary}
                {e.summary.length > 200 && (
                  <details className="mt-1"><summary className="cursor-pointer text-faint">More</summary><p className="mt-1 whitespace-pre-wrap">{e.summary}</p></details>
                )}
              </div>
            </li>
          );
        }
        const live = running && e.id === lastAgent;
        const tone = e.who === 'you' ? null : cardTone[live ? 'live' : (e.tone ?? 'default')];
        const pose: Pose | undefined = live ? 'investigating' : e.pose;
        return (
          <li key={e.id} className="relative flex items-start gap-3.5">
            <span className="relative z-[1] flex w-8 flex-none justify-center">
              {e.who === 'you' ? <UserTile letters={initials(user.name, user.login)} size={32} /> : pose ? <span className="-mx-2.5 -mt-2.5 block"><Mascot pose={pose} size={52} label="" /></span> : <Mascot avatar size={32} label="" />}
            </span>
            <div className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-[10px] border px-3.5 pt-2.5 pb-3 ${e.who === 'you' ? 'border-purple-700 bg-purple-850' : tone!.box}`}>
              <div className="flex items-baseline justify-between gap-2.5">
                <span className={`font-mono text-[13px] font-semibold ${e.who === 'you' ? 'text-foreground' : tone!.label}`}>{e.label}</span>
                <span className="flex-none font-mono text-xs text-subtle">{e.t}</span>
              </div>
              <p className="text-[15px] text-[#e4dcfb] text-pretty [overflow-wrap:anywhere]">{e.summary}</p>
              {e.attach && e.attach.length > 0 && <span className="flex flex-wrap gap-1.5">{e.attach.map((a) => <span key={a} className="rounded-sm bg-purple-850 px-2 py-[3px] font-mono text-xs text-muted">{a}</span>)}</span>}
              {e.observ && (
                <details open className="text-sm">
                  <summary className="cursor-pointer font-mono text-xs font-medium text-subtle">{e.observ.title}</summary>
                  {e.observ.moments && e.observ.moments.length > 0 && (
                    <ol className="m-0 mt-1.5 flex list-none flex-col gap-1 rounded-md bg-ink p-2.5">
                      {e.observ.moments.map((m) => (
                        <li key={m.at + m.what} className="flex gap-3 text-sm text-muted"><span className="w-10 flex-none font-mono text-xs text-hot">{m.at}</span>{m.what}</li>
                      ))}
                    </ol>
                  )}
                  <p className="mt-1.5 rounded-md bg-ink px-3 py-2.5 text-muted">{e.observ.text}</p>
                </details>
              )}
              {e.sources && e.sources.length > 0 && (
                <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">{e.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>)}</span>
              )}
              {e.proof && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-mono text-xs font-medium text-subtle">Proof, computed by the model</summary>
                  <pre className="m-0 mt-1.5 max-h-48 overflow-auto rounded-md bg-code px-3 py-2.5 font-mono text-xs text-muted">{e.proof.code}{e.proof.output ? `\n→ ${e.proof.output}` : ''}</pre>
                </details>
              )}
              {e.chips && e.chips.length > 0 && <span className="flex flex-wrap gap-1.5">{e.chips.map((c) => <Chip key={c}>{c}</Chip>)}</span>}
              {e.list && e.list.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {e.list.map((h) => <li key={h.title} className="text-sm text-muted"><span className="text-foreground">{h.title}</span> <span className="font-mono text-xs text-subtle">({h.sub})</span></li>)}
                </ul>
              )}
              {e.matrix && (
                <div className="mt-1">
                  <MatrixTable rows={e.matrix.rows} isolated={e.matrix.after ? [] : isolated} isolatedLabel={e.matrix.after ? undefined : label} added={added} otherRows={(run.otherProblems ?? []).map((o) => o.profile)} />
                </div>
              )}
              {e.out && <pre className={`m-0 max-h-64 overflow-auto rounded-md border border-purple-800 bg-code px-3 py-2.5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap ${e.out.tone === 'fail' ? 'text-[#ffb3ab]' : 'text-[#a6f3cd]'}`}>{e.out.text}</pre>}
            </div>
          </li>
        );
      })}
      {running && (
        <li className="flex items-center gap-3.5 pl-[46px] font-mono text-[13px] text-cyan">
          <PixelDots />
          Working…
        </li>
      )}
    </ol>
  );
}
