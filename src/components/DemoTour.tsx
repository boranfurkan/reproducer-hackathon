'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { IconArrowLeft, IconArrowRight, IconX } from './icons';

// A guided tour for recording the demo: it highlights one feature at a time with a short caption, page by page. On only when the app runs with
// NEXT_PUBLIC_DEMO_TOUR=1 (`npm run dev:demo`); `?tour=0` or `?tour=1` in the URL switches it for this browser. Keys: → or Enter next, ← back,
// Esc hides it, T shows it again. Steps whose element is not on the page (a run that is still going has no approval card) are skipped.

interface Step {
  /** The data-tour mark of the element to highlight; none = a caption without a highlight. */
  target?: string;
  title: string;
  text: string;
}

const TOURS: { match: (path: string) => boolean; steps: Step[] }[] = [
  {
    match: (p) => p === '/',
    steps: [
      { title: 'ReProducer', text: 'Bugs you cannot reproduce, reproduced. This is the dashboard.' },
      { target: 'repos', title: 'Your repositories', text: 'Any public GitHub repository with bug reports.' },
      { target: 'runs', title: 'Investigations', text: 'Every run, live or finished. Fixed ones wait for your approval.' },
      { target: 'clusters', title: 'Possible shared bug', text: 'Atlas Stream Processing counts reports per environment, live.' },
      { target: 'ask', title: 'Ask the memory', text: 'Gemini calls tools over MongoDB to answer questions about past bugs.' },
      { target: 'learned', title: 'What it has learned', text: 'Atlas Search facets over every verified fix.' },
    ],
  },
  {
    match: (p) => /^\/repos\/[^/]+\/[^/]+$/.test(p),
    steps: [
      { target: 'tickets', title: 'The tickets', text: 'Open issues, straight from GitHub.' },
      { target: 'triage', title: 'Triage', text: 'Gemini flags the issues that look environment-specific.' },
    ],
  },
  {
    match: (p) => /^\/repos\/[^/]+\/[^/]+\/issues\/\d+$/.test(p),
    steps: [
      { target: 'who', title: 'Who hit the bug?', text: 'One sentence about the reporter. ReProducer rebuilds their environment.' },
      { target: 'recording', title: 'Their recording', text: 'Gemini watches a screen recording for the steps and the clues.' },
      { target: 'depth', title: 'Deep investigation', text: 'Gemini 4 Argon with the code, its history and the framework source.' },
      { target: 'sandbox', title: 'Sandbox', text: 'A Linux sandbox with real browsers, warmed up in advance.' },
      { target: 'investigate', title: 'Investigate', text: 'Nothing reaches GitHub until you approve.' },
    ],
  },
  {
    match: (p) => p.startsWith('/runs/'),
    steps: [
      { target: 'run-header', title: 'The investigation', text: 'Status, time and tokens, live.' },
      { target: 'now', title: 'Working live', text: 'Argon’s thinking streams here while it works.' },
      { target: 'notes-earlier', title: 'Notes from earlier runs', text: 'It starts where the last run of this issue stopped.' },
      { target: 'matrix', title: 'Replay matrix', text: 'The same steps under many environments, in Chromium and WebKit.' },
      { target: 'context', title: 'A million-token context', text: 'The app, its git history and the framework source, all in Argon.' },
      { target: 'experiment', title: 'Experiments', text: 'Argon tests its ideas in real browsers and measures the page.' },
      { target: 'concluded', title: 'The cause, with evidence', text: 'The environment that reproduces it, and why.' },
      { target: 'red', title: 'Red, then green', text: 'The new test fails before the fix and passes after it.' },
      { target: 'explained', title: 'Why this happens', text: 'Google Search and code execution explain the browser rule, with sources.' },
      { target: 'notes-saved', title: 'Notes for the next run', text: 'A run that stops leaves notes in MongoDB for the next one.' },
      { target: 'approval', title: 'You approve', text: 'Root cause, diff and test. Only this click opens a pull request.' },
    ],
  },
  {
    match: (p) => p === '/insights',
    steps: [{ target: 'insights', title: 'Insights', text: 'MongoDB aggregation pipelines over every run: time, tokens and outcomes.' }],
  },
];

const NO_STEPS: Step[] = [];
const ENABLED = process.env.NEXT_PUBLIC_DEMO_TOUR === '1';

function readSwitch(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('tour');
    if (q === '1' || q === '0') localStorage.setItem('rp-tour', q);
    const saved = localStorage.getItem('rp-tour');
    return saved === null ? ENABLED : saved === '1';
  } catch {
    return ENABLED;
  }
}

export default function DemoTour() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const [hidden, setHidden] = useState(false);
  // The step is remembered per page: a new page starts at its first step.
  const [pos, setPos] = useState({ path: pathname, i: 0 });
  const index = pos.path === pathname ? pos.i : 0;
  // Steps of this page whose element exists (or that need none), checked again while the page loads.
  const [present, setPresent] = useState<Step[]>([]);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Read after hydration (the server never knows the switch).
  useEffect(() => {
    const t = setTimeout(() => setOn(readSwitch()), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  const all = TOURS.find((t) => t.match(pathname))?.steps ?? NO_STEPS;
  useEffect(() => {
    if (!on) return;
    const check = () => setPresent((prev) => {
      const next = all.filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`));
      return next.length === prev.length && next.every((s, i) => s === prev[i]) ? prev : next;
    });
    const first = setTimeout(check, 0);
    const timer = setInterval(check, 700);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [on, all]);

  const step = present[Math.min(index, Math.max(0, present.length - 1))];
  const at = step ? present.indexOf(step) : 0;

  // Bring the highlighted element into view, then follow it while the page scrolls or changes.
  useEffect(() => {
    if (!on || hidden || !step?.target) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    let frame = 0;
    const follow = () => {
      const now = document.querySelector(`[data-tour="${step.target}"]`);
      setRect(now ? now.getBoundingClientRect() : null);
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [on, hidden, step]);

  const go = useCallback((d: number) => setPos({ path: pathname, i: Math.max(0, Math.min(present.length - 1, at + d)) }), [at, present.length, pathname]);

  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
      if (typing) return;
      if (e.key === 'Escape') setHidden(true);
      else if (e.key === 't' || e.key === 'T') setHidden(false);
      else if (!hidden && (e.key === 'ArrowRight' || e.key === 'Enter')) { e.preventDefault(); go(1); }
      else if (!hidden && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on, hidden, go]);

  if (!on || !step || hidden) return null;
  const pad = 8;
  // The last measured box, only while this step highlights something.
  const box = step.target ? rect : null;
  return (
    <>
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] rounded-xl border-2 border-hot transition-all duration-200"
          style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: '0 0 0 9999px rgba(9,5,28,0.55), 0 0 24px rgba(255,121,198,0.45)' }}
        />
      )}
      <div role="dialog" aria-label="Demo tour" className="fixed bottom-6 left-6 z-[61] flex w-[min(400px,calc(100vw-48px))] flex-col gap-2 rounded-xl border-2 border-hot bg-purple-900 p-4 shadow-[0_24px_60px_-20px_rgba(255,121,198,0.45)]">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-hot uppercase">{at + 1} / {present.length}</span>
          <button type="button" onClick={() => setHidden(true)} aria-label="Hide the tour" className="grid size-6 place-items-center rounded-md text-subtle hover:bg-purple-850 hover:text-foreground"><IconX size={14} /></button>
        </div>
        <h2 className="font-mono text-[17px] font-semibold text-foreground">{step.title}</h2>
        <p className="text-[15px] leading-snug text-muted">{step.text}</p>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={() => go(-1)} disabled={at === 0} aria-label="Previous" className="grid size-8 place-items-center rounded-md border border-purple-700 text-muted hover:bg-purple-850 hover:text-foreground disabled:opacity-40"><IconArrowLeft size={14} /></button>
          <button type="button" onClick={() => go(1)} disabled={at >= present.length - 1} aria-label="Next" className="grid size-8 place-items-center rounded-md border border-purple-700 text-muted hover:bg-purple-850 hover:text-foreground disabled:opacity-40"><IconArrowRight size={14} /></button>
          <span className="ml-auto flex gap-1" aria-hidden="true">
            {present.map((s, i) => <span key={s.title} className={`size-1.5 ${i === at ? 'bg-hot' : 'bg-purple-700'}`} />)}
          </span>
        </div>
      </div>
    </>
  );
}
