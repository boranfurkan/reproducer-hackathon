'use client';

import { useState } from 'react';
import { Busy } from './loaders';
import { ErrorNote, Eyebrow, Panel, buttonClass } from './ui';
import { askMemory } from '@/lib/hooks';

const EXAMPLES = ['Which bugs only some browsers or settings caused?', 'What isolates most bugs, and how many?', 'Are any of my fixes waiting for review?'];

const TOOL_LABEL: Record<string, string> = { search_memory: 'searched memory', memory_counts: 'counted by', list_my_runs: 'listed your runs' };

/** Ask the memory in plain words. The model calls read-only functions over MongoDB; the chips show what it looked at. */
export default function AskMemory() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof askMemory>> | null>(null);

  async function ask(q: string) {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      setResult(await askMemory(q));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="flex flex-col gap-3 p-[18px]">
      <div className="flex flex-col gap-1">
        <h2 className="font-mono text-[15px] font-semibold">Ask the memory</h2>
        <p className="text-[13px] text-subtle">In plain words. It looks things up before it answers.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex flex-col gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={400} placeholder="Which bugs came from browser extensions?" aria-label="Question for the memory" className="min-w-0 rounded-md border border-purple-700 bg-ink px-3 py-2.5 text-[15px] text-foreground outline-0 placeholder:text-subtle focus:border-purple-500" />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => { setQuestion(ex); ask(ex); }} disabled={busy} className="rounded-sm border border-purple-700 px-2.5 py-1 text-left font-mono text-xs text-muted transition-colors hover:bg-purple-850 hover:text-foreground disabled:opacity-50">{ex}</button>
          ))}
        </div>
        <button type="submit" disabled={busy || question.trim().length < 3} className={`${buttonClass('primary', 'sm')} self-start`}>{busy ? <Busy>Looking it up</Busy> : 'Ask'}</button>
      </form>
      {error && <ErrorNote message={error} />}
      {result && !busy && (
        <div className="flex flex-col gap-2.5 border-t border-purple-800 pt-3">
          <p className="text-sm text-pretty">{result.answer}</p>
          <div className="flex flex-wrap gap-1.5">
            {result.calls.map((c, i) => (
              <span key={i} className="rounded-sm bg-purple-850 px-2 py-0.5 font-mono text-[11px] text-purple-200">
                {TOOL_LABEL[c.tool] ?? c.tool}{c.args.query ? `: ${String(c.args.query).slice(0, 28)}` : c.args.group_by ? ` ${String(c.args.group_by)}` : ''} · {c.found}
              </span>
            ))}
          </div>
          <Eyebrow>{result.tokens.toLocaleString('en')} tokens</Eyebrow>
        </div>
      )}
    </Panel>
  );
}
