'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { IconArrowLeft, IconArrowRight, IconRefresh, IconX } from './icons';

// A guided tour for recording the demo: one sequence through the whole story, page after page. Each step highlights one element with a short
// caption; the last step of a page points at what to open next, and → opens it (or click it yourself). On only when the app runs with
// NEXT_PUBLIC_DEMO_TOUR=1 (`npm run dev:demo`); `?tour=0` or `?tour=1` in the URL switches it for this browser. Keys: → or Enter next,
// ← back, Esc hides the card, T shows it, R starts again from the dashboard. The position is kept in this browser, so a reload continues;
// restarting the server starts the tour again from step 1.

type Page = 'home' | 'repo' | 'ticket' | 'run' | 'insights';

interface Step {
  page: Page;
  /** The data-tour mark of the element to highlight; none = a caption only. */
  target?: string;
  title: string;
  text: string;
  /** click: → clicks the target (opening the next page, or filling a field); goto: → goes to href. */
  action?: 'click' | 'goto';
  href?: string;
  /** Skipped by → when its element is not on the page (data still loading, a run without that step). */
  optional?: boolean;
}

const STEPS: Step[] = [
  { page: 'home', title: 'ReProducer', text: 'Bugs you cannot reproduce, reproduced. This is the dashboard.' },
  { page: 'home', target: 'repos', title: 'Your repositories', text: 'Any public GitHub repository with bug reports.' },
  { page: 'home', target: 'runs', title: 'Investigations', text: 'Every run, live or finished. Fixed ones wait for your approval.' },
  { page: 'home', target: 'clusters', optional: true, title: 'Possible shared bug', text: 'Atlas Stream Processing counts reports per environment, live.' },
  { page: 'home', target: 'ask', title: 'Ask the memory', text: 'Gemini calls tools over MongoDB to answer questions about past bugs.' },
  { page: 'home', target: 'learned', optional: true, title: 'What it has learned', text: 'Atlas Search facets over every verified fix.' },
  { page: 'home', target: 'repo-reproducer-hackathon-demo', action: 'click', title: 'Open the demo shop', text: 'Five small apps in five stacks, with real bug reports.' },

  { page: 'repo', target: 'tickets', title: 'The tickets', text: 'Open GitHub issues, shown as tickets.' },
  { page: 'repo', target: 'triage', optional: true, title: 'Triage', text: 'Gemini flags the issues that look environment-specific.' },
  { page: 'repo', target: 'ticket-8', action: 'click', title: 'Issue #8', text: 'The shop turns white for some customers. Let’s investigate it.' },

  { page: 'ticket', target: 'report', title: 'The report', text: 'The customer’s words, straight from GitHub.' },
  { page: 'ticket', target: 'who', title: 'Who hit the bug?', text: 'One sentence about the reporter. ReProducer rebuilds their environment.' },
  { page: 'ticket', target: 'note-8', action: 'click', title: 'What we know', text: 'Customer in Munich, Chrome on Windows 11, German is her language.' },
  { page: 'ticket', target: 'recording', title: 'Their recording', text: 'Gemini watches a screen recording for the steps and the clues.' },
  { page: 'ticket', target: 'env', title: 'Environment variables', text: 'Sent to the sandbox only, never stored.' },
  { page: 'ticket', target: 'depth', title: 'Deep investigation', text: 'Gemini 4 Argon with the code, its history and the framework source.' },
  { page: 'ticket', target: 'sandbox', optional: true, title: 'Sandbox', text: 'A Linux sandbox with real browsers, warmed up in advance.' },
  { page: 'ticket', target: 'investigate', action: 'click', title: 'Investigate', text: 'Nothing reaches GitHub until you approve.' },

  { page: 'run', target: 'run-header', title: 'The investigation', text: 'Status, time and tokens, live.' },
  { page: 'run', target: 'now', optional: true, title: 'Working live', text: 'Argon’s thinking streams here while it works.' },
  { page: 'run', target: 'timeline', title: 'The timeline', text: 'Every step appears here as it happens, and is stored in MongoDB.' },
  { page: 'run', action: 'goto', href: '/', title: 'Next: the finished run', text: 'A deep run takes about 25 minutes. Here is the same issue, investigated earlier.' },

  { page: 'home', target: 'run-8-fixed', action: 'click', title: 'The finished investigation', text: 'Issue #8, fixed and verified, waiting for approval.' },

  { page: 'run', target: 'run-header', title: 'Fixed and verified', text: 'From the report to a verified fix, with every step on record.' },
  { page: 'run', target: 'matrix', optional: true, title: 'Replay matrix', text: 'The same steps under many environments, in Chromium and WebKit.' },
  { page: 'run', target: 'context', optional: true, title: 'A million-token context', text: 'The app, its git history and the framework source, all in Argon.' },
  { page: 'run', target: 'experiment', optional: true, title: 'Experiments', text: 'Argon tests its ideas in real browsers and measures the page.' },
  { page: 'run', target: 'concluded', optional: true, title: 'The cause, with evidence', text: 'The environment that reproduces it, and why.' },
  { page: 'run', target: 'red', optional: true, title: 'Red, then green', text: 'The new test fails before the fix and passes after it.' },
  { page: 'run', target: 'explained', optional: true, title: 'Why this happens', text: 'Google Search and code execution explain the browser rule, with sources.' },
  { page: 'run', target: 'approval', optional: true, title: 'You approve', text: 'Root cause, diff and test. Only this click opens a pull request.' },
  { page: 'run', action: 'goto', href: '/', title: 'Next: a run that stopped', text: 'What happens when an investigation does not finish?' },

  { page: 'home', target: 'run-10-stopped', action: 'click', title: 'A stopped run', text: 'Issue #10, stopped halfway on purpose.' },
  { page: 'run', target: 'notes-saved', optional: true, title: 'Notes for the next run', text: 'Even stopped, it saved what it tried in MongoDB.' },
  { page: 'run', action: 'goto', href: '/', title: 'Next: the run after it', text: 'The next run of the same issue.' },

  { page: 'home', target: 'run-10-fixed', action: 'click', title: 'The next run', text: 'Issue #10 again, started a few minutes later.' },
  { page: 'run', target: 'notes-earlier', optional: true, title: 'Notes from earlier runs', text: 'It started from those notes: 5 minutes instead of 14.' },
  { page: 'run', target: 'nav-insights', action: 'click', title: 'Insights', text: 'What it did and what it cost.' },

  { page: 'insights', target: 'insights', title: 'Insights', text: 'MongoDB aggregation pipelines over every run: time, tokens and outcomes.' },
  { page: 'insights', title: 'ReProducer', text: 'Rebuild the customer’s world, investigate with Argon, prove the fix, ship only when you approve.' },
];

const ENABLED = process.env.NEXT_PUBLIC_DEMO_TOUR === '1';
// The saved position belongs to one start of the server: a restart begins the tour at step 1.
const KEY = `rp-tour-step-${process.env.NEXT_PUBLIC_TOUR_RUN ?? ''}`;

function pageOf(path: string): Page | null {
  if (path === '/') return 'home';
  if (path === '/insights') return 'insights';
  if (path.startsWith('/runs/')) return 'run';
  if (/^\/repos\/[^/]+\/[^/]+\/issues\/\d+$/.test(path)) return 'ticket';
  if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) return 'repo';
  return null;
}

/** The step to show on this page: the remembered one if it belongs here, else the next one that does (after a click opened this page),
 * else the latest earlier one (while a click is still opening the next page, or after going back). */
function resolve(stored: number, page: Page | null): number {
  if (!page) return -1;
  if (STEPS[stored]?.page === page) return stored;
  const ahead = STEPS.findIndex((s, i) => i > stored && s.page === page);
  if (ahead !== -1) return ahead;
  for (let i = Math.min(stored, STEPS.length - 1); i >= 0; i--) if (STEPS[i].page === page) return i;
  return STEPS.findIndex((s) => s.page === page);
}

const find = (mark?: string) => (mark ? document.querySelector<HTMLElement>(`[data-tour="${mark}"]`) : null);

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

function readStep(): number {
  try {
    return Math.max(0, Math.min(STEPS.length - 1, Number(localStorage.getItem(KEY) ?? 0) || 0));
  } catch {
    return 0;
  }
}

export default function DemoTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [stored, setStored] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Read after hydration (the server never knows the switch or the position).
  useEffect(() => {
    const t = setTimeout(() => {
      setOn(readSwitch());
      setStored(readStep());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const page = pageOf(pathname);
  const index = resolve(stored, page);
  const step = index >= 0 ? STEPS[index] : undefined;

  useEffect(() => {
    if (!on || index < 0) return;
    try {
      localStorage.setItem(KEY, String(index));
    } catch {
      // the position is a convenience only
    }
  }, [on, index]);

  // Bring the highlighted element into view, then follow it while the page scrolls, loads or changes.
  useEffect(() => {
    if (!on || hidden || !step?.target) return;
    let frame = 0;
    let scrolled = false;
    const follow = () => {
      const el = find(step.target);
      if (el && !scrolled) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        scrolled = true;
      }
      setRect(el ? el.getBoundingClientRect() : null);
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [on, hidden, step]);

  const next = useCallback(() => {
    if (!step) return;
    if (step.action === 'click') {
      const el = find(step.target);
      if (!el) return; // not loaded yet: press again in a moment
      setStored(index + 1);
      el.click();
      return;
    }
    if (step.action === 'goto' && step.href) {
      setStored(index + 1);
      router.push(step.href);
      return;
    }
    // The next step on this page, skipping optional ones whose element is not here; a step of another page waits for its click.
    let j = index + 1;
    while (j < STEPS.length && STEPS[j].page === step.page && STEPS[j].optional && !find(STEPS[j].target)) j++;
    if (j < STEPS.length && STEPS[j].page === step.page) setStored(j);
  }, [step, index, router]);

  const back = useCallback(() => {
    if (!step) return;
    let j = index - 1;
    while (j >= 0 && STEPS[j].page === step.page && STEPS[j].optional && !find(STEPS[j].target)) j--;
    if (j >= 0 && STEPS[j].page === step.page && !STEPS[j].action) setStored(j);
  }, [step, index]);

  const restart = useCallback(() => {
    setStored(0);
    setHidden(false);
    router.push('/');
  }, [router]);

  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setHidden(true);
      else if (e.key === 't' || e.key === 'T') setHidden(false);
      else if (e.key === 'r' || e.key === 'R') restart();
      else if (!hidden && (e.key === 'ArrowRight' || e.key === 'Enter')) { e.preventDefault(); next(); }
      else if (!hidden && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on, hidden, next, back, restart]);

  if (!on || !step || hidden) return null;
  const pad = 8;
  const box = step.target ? rect : null;
  const opens = step.action === 'click' || step.action === 'goto';
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
          <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-hot uppercase">Step {index + 1} of {STEPS.length}</span>
          <span className="flex gap-1">
            <button type="button" onClick={restart} aria-label="Start the tour again" className="grid size-6 place-items-center rounded-md text-subtle hover:bg-purple-850 hover:text-foreground"><IconRefresh size={13} /></button>
            <button type="button" onClick={() => setHidden(true)} aria-label="Hide the tour" className="grid size-6 place-items-center rounded-md text-subtle hover:bg-purple-850 hover:text-foreground"><IconX size={14} /></button>
          </span>
        </div>
        <h2 className="font-mono text-[17px] font-semibold text-foreground">{step.title}</h2>
        <p className="text-[15px] leading-snug text-muted">{step.text}</p>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={back} aria-label="Previous" className="grid size-8 place-items-center rounded-md border border-purple-700 text-muted hover:bg-purple-850 hover:text-foreground"><IconArrowLeft size={14} /></button>
          <button type="button" onClick={next} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-purple-700 px-2.5 font-mono text-xs text-muted hover:bg-purple-850 hover:text-foreground">
            {opens ? (step.action === 'goto' ? 'Go' : 'Open') : 'Next'}
            <IconArrowRight size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
