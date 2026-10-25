import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconArrowLeft } from './icons';
import type { RunView } from '@/lib/client';

// Shared atoms of the ReProducer design. Tokens live in src/styles/globals.css.

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const base = 'inline-flex items-center justify-center gap-2 rounded-md font-mono transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-purple-200 font-semibold text-purple-950 hover:bg-accent-hover',
  secondary: 'border border-purple-700 font-medium text-foreground hover:bg-purple-850',
  danger: 'border border-[#6b2a3a] font-medium text-fail hover:bg-fail/10',
};
const sizes = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3.5 text-[15px]' };

/** Class names for a button, so the same look works on <button> and on links. */
export const buttonClass = (variant: ButtonVariant = 'primary', size: keyof typeof sizes = 'md') => `${base} ${variants[variant]} ${sizes[size]}`;

/** The way back to the page above, as a small button with an arrow. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${buttonClass('secondary', 'sm')} max-w-full self-start text-muted no-underline hover:text-foreground`}>
      <IconArrowLeft size={14} />
      <span className="truncate">{children}</span>
    </Link>
  );
}

/** A small label above a block: "ROOT CAUSE", "TIMELINE". */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-mono text-xs font-medium tracking-[0.08em] text-subtle uppercase ${className}`}>{children}</h2>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-purple-800 bg-purple-900 ${className}`}>{children}</section>;
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-sm border border-purple-700 px-2 py-0.5 font-mono text-xs text-purple-200 ${className}`}>{children}</span>;
}

export type Tone = 'running' | 'waiting' | 'verified' | 'fail' | 'stopped';

const tones: Record<Tone, { chip: string; dot: string }> = {
  running: { chip: 'bg-cyan/12 text-cyan', dot: 'bg-cyan' },
  waiting: { chip: 'bg-amber/12 text-amber', dot: 'bg-amber' },
  verified: { chip: 'bg-pass/12 text-pass', dot: 'bg-pass' },
  fail: { chip: 'bg-fail/12 text-fail', dot: 'bg-fail' },
  stopped: { chip: 'bg-purple-850 text-muted', dot: 'bg-subtle' },
};

/** A status chip with a square marker, as in the design system. */
export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = tones[tone];
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 rounded-sm px-2.5 py-[3px] font-mono text-xs font-medium whitespace-nowrap ${t.chip}`}>
      <span className={`size-1.5 ${t.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** The chip for a run, in words. `inList` uses the shorter wording of the dashboard ("Waiting for you"). */
export function runStatus(run: Pick<RunView, 'status' | 'prUrl' | 'rejectedAt' | 'prState'>, inList = false): { tone: Tone; label: string } {
  if (run.prUrl) {
    if (run.prState === 'merged') return { tone: 'verified', label: 'PR merged' };
    if (run.prState === 'closed') return { tone: 'stopped', label: 'PR closed' };
    return { tone: 'verified', label: 'PR opened' };
  }
  if (run.rejectedAt) return { tone: 'stopped', label: 'Rejected' };
  switch (run.status) {
    case 'running': return { tone: 'running', label: 'Running' };
    case 'fixed': return inList ? { tone: 'waiting', label: 'Waiting for you' } : { tone: 'verified', label: 'Fix verified' };
    case 'not_reproduced': return { tone: 'fail', label: 'Not reproduced' };
    case 'no_fix': return { tone: 'fail', label: 'No fix found' };
    case 'stopped': return { tone: 'stopped', label: 'Stopped' };
    default: return { tone: 'fail', label: 'Failed' };
  }
}

export function RunStatusChip({ run, inList = false }: { run: Pick<RunView, 'status' | 'prUrl' | 'rejectedAt' | 'prState'>; inList?: boolean }) {
  const s = runStatus(run, inList);
  return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-[#6b2a3a] bg-fail/8 px-3 py-2 text-sm text-fail">
      {message}
    </p>
  );
}

/** Three pixels that light up in turn, for "working" and "warming up" (.rp-dot in globals.css; still for reduced motion). */
export function PixelDots({ className = 'bg-cyan' }: { className?: string }) {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      <span className={`rp-dot size-1.5 ${className}`} />
      <span className={`rp-dot size-1.5 ${className}`} />
      <span className={`rp-dot size-1.5 ${className}`} />
    </span>
  );
}

/** Text from the model with `backticks` shown as code. */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-[0.92em] text-hot">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Two-letter avatar tile, as in the design (split purple). */
export function UserTile({ letters, size = 28 }: { letters: string; size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-sm font-mono font-semibold text-foreground"
      style={{ width: size, height: size, fontSize: size > 28 ? 12 : 11, background: 'linear-gradient(#44307e 0 50%, #6d42c9 50%)' }}
    >
      {letters}
    </span>
  );
}
