import type { ReactNode } from 'react';
import Mascot from './mascot/Mascot';
import { PixelDots, Panel } from './ui';

// Loading states of the design: skeleton blocks that pulse in whole pixel steps (see .rp-skel in globals.css), a page loader with the
// mascot, and a label with pixels for buttons that are waiting. Skeletons copy the shape of what is loading, so the page does not jump.

export function Skeleton({ className = '', height }: { className?: string; height?: number }) {
  return <span aria-hidden="true" className={`rp-skel block rounded-sm ${className}`} style={height ? { height } : undefined} />;
}

/** Announces to screen readers that a region is loading. */
export function Loading({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** A whole-page wait (checking the session): the mascot looks through its lens while the page comes up. */
export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <Loading label={label} className="flex flex-col items-center gap-4 py-24">
      <Mascot pose="investigating" size={88} label="" />
      <span className="flex items-center gap-2.5 font-mono text-[13px] text-cyan">
        <PixelDots />
        {label}…
      </span>
    </Loading>
  );
}

/** Text with pixels for a button that is waiting: "Opening pull request" and three fading pixels. */
export function Busy({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <PixelDots className="bg-current" />
      {children}
    </span>
  );
}

export function RepoRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Loading label="Loading repositories" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-purple-800 bg-purple-900 px-[18px] py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

export function RunCardsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Loading label="Loading investigations" className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-purple-800 bg-purple-900 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </Loading>
  );
}

export function IssueRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Loading label="Loading issues" className="flex flex-col overflow-hidden rounded-lg border border-purple-800">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-purple-800 bg-purple-900 px-[18px] py-4 last:border-b-0">
          <Skeleton className="h-3.5 w-7 flex-none" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** The report panel of the ticket form while the issue loads. */
export function ReportSkeleton() {
  return (
    <Loading label="Loading the report" className="flex flex-col gap-3">
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-3/5" />
    </Loading>
  );
}

export function LearnedSkeleton() {
  return (
    <Panel className="p-[18px]">
      <Loading label="Loading what it has learned" className="flex flex-col gap-3.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-3/4" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-2" />)}
      </Loading>
    </Panel>
  );
}

/** The run page while the run loads: header, timeline entries and the side column, in their real positions. */
export function RunPageSkeleton() {
  return (
    <Loading label="Loading the investigation" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-8 w-3/5" />
        <div className="flex gap-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-40" />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1.1_1_440px] flex-col gap-[18px]">
          {[28, 36, 24, 44].map((h, i) => (
            <div key={i} className="flex items-start gap-3.5">
              <Skeleton className="size-8 flex-none rounded-md" />
              <div className="flex flex-1 flex-col gap-2.5 rounded-[10px] border border-purple-800 bg-purple-900 px-3.5 pt-3 pb-3.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="w-3/4" height={h} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-[0.8_1_340px] flex-col gap-4">
          <Panel className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3.5">
              <Skeleton className="size-20 flex-none" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-3 w-2/3" />)}
          </Panel>
        </div>
      </div>
    </Loading>
  );
}
