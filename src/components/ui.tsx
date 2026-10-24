import type { ReactNode } from 'react';

export const buttonClass = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900',
  danger: 'inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950',
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-zinc-200 bg-white/60 p-5 dark:border-zinc-800 dark:bg-zinc-950/60 ${className}`}>{children}</section>;
}

const tones: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  fixed: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  pass: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  fail: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  no_fix: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  not_reproduced: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  stopped: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};
const labels: Record<string, string> = { running: 'Running', fixed: 'Fix verified', no_fix: 'No fix found', not_reproduced: 'Not reproduced', stopped: 'Stopped', failed: 'Failed', pass: 'Pass', fail: 'Fail' };

export function Badge({ kind, label }: { kind: string; label?: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[kind] ?? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>{label ?? labels[kind] ?? kind}</span>;
}

export function ErrorNote({ message }: { message: string }) {
  return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{message}</p>;
}
