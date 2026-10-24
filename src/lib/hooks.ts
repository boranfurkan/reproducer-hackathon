'use client';

// The data layer of the UI. Every page reads and writes through these hooks and functions and nothing else, so the look of the app can
// be redesigned without touching any of this. The HTTP shapes live in `src/lib/client.ts` and are described in `docs/UI.md`.

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  api,
  type ClusterAlert,
  type IssueItem,
  type MediaItem,
  type MemoryFacets,
  type RepoItem,
  type RunView,
  type SessionUser,
  type SimilarFix,
  type TimelineEvent,
} from './client';

/** undefined while loading, null when logged out. */
export function useSession(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => {
    api<{ user: SessionUser | null }>('/api/session').then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  return user;
}

/** The signed-in user's repositories (public and private; the UI decides what to show). `repos` is null while loading. */
export function useRepos(): { repos: RepoItem[] | null; error: string } {
  const [repos, setRepos] = useState<RepoItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ repos: RepoItem[] }>('/api/repos').then((r) => setRepos(r.repos)).catch((e: Error) => setError(e.message));
  }, []);
  return { repos, error };
}

/** The user's recent investigations, newest first. null while loading. */
export function useRuns(): RunView[] | null {
  const [runs, setRuns] = useState<RunView[] | null>(null);
  useEffect(() => {
    api<{ runs: RunView[] }>('/api/runs').then((r) => setRuns(r.runs)).catch(() => setRuns([]));
  }, []);
  return runs;
}

/** What the memory has learned (Atlas Search facets). undefined while loading, null when unavailable. */
export function useMemoryFacets(): MemoryFacets | null | undefined {
  const [memory, setMemory] = useState<MemoryFacets | null | undefined>(undefined);
  useEffect(() => {
    api<MemoryFacets>('/api/memory').then(setMemory).catch(() => setMemory(null));
  }, []);
  return memory;
}

/** Shared-bug alerts from the Stream Processing job. Empty until it runs. */
export function useClusters(): ClusterAlert[] {
  const [clusters, setClusters] = useState<ClusterAlert[]>([]);
  useEffect(() => {
    api<{ clusters: ClusterAlert[] }>('/api/clusters').then((r) => setClusters(r.clusters)).catch(() => setClusters([]));
  }, []);
  return clusters;
}

/** Open issues of one repository. `issues` is null while loading. */
export function useIssues(owner: string, name: string): { issues: IssueItem[] | null; error: string } {
  const [issues, setIssues] = useState<IssueItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ issues: IssueItem[] }>(`/api/repos/${owner}/${name}/issues`).then((r) => setIssues(r.issues)).catch((e: Error) => setError(e.message));
  }, [owner, name]);
  return { issues, error };
}

export type WarmState = 'warm' | 'warming' | 'cold' | null;

/**
 * Starts getting the sandbox ready (Playwright, the clone) while the developer fills in the ticket form, and reports its state:
 * 'warming' until it is ready (polled every 4 s), then 'warm'. null until the first answer. Call it once from the form.
 */
export function useWarmSandbox(owner: string, name: string): WarmState {
  const [state, setState] = useState<WarmState>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () =>
      api<{ state: WarmState }>('/api/warm')
        .then((r) => {
          if (!alive) return;
          setState(r.state === 'cold' ? 'warming' : r.state);
          if (r.state !== 'warm') timer = setTimeout(poll, 4000);
        })
        .catch(() => undefined);
    api<{ state: string }>('/api/warm', { method: 'POST', body: JSON.stringify({ owner, name }) })
      .then((r) => {
        if (!alive) return;
        setState(r.state === 'warm' ? 'warm' : 'warming');
        if (r.state !== 'warm') timer = setTimeout(poll, 4000);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [owner, name]);
  return state;
}

/** The current time in milliseconds, refreshed every second while `active`. Used for the live elapsed counter. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/**
 * One investigation: the run, its timeline in order, similar past fixes, and `reload`. It refreshes itself every 2.5 s while the run is
 * still running. `run` is null while loading.
 */
export function useRun(id: string): { run: RunView | null; events: TimelineEvent[]; similar: SimilarFix[]; error: string; reload: () => void } {
  const [run, setRun] = useState<RunView | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [similar, setSimilar] = useState<SimilarFix[]>([]);
  const [error, setError] = useState('');
  // Bumping `tick` reloads the run: the poll timer and the approval buttons both do it.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    api<{ run: RunView; events: TimelineEvent[]; similar: SimilarFix[] }>(`/api/runs/${id}`)
      .then((r) => {
        if (!alive) return;
        setRun(r.run);
        setEvents(r.events);
        setSimilar(r.similar ?? []);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id, tick]);

  // Live updates: a MongoDB change stream on the run, pushed as server-sent events (each message says "something changed", then the page
  // reloads the run). The slow poll is only a safety net; if the stream drops, the page falls back to the fast poll until it is back.
  const running = run?.status === 'running';
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/runs/${id}/stream`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = () => {
      if (timer) return; // coalesce a burst of changes into one reload
      timer = setTimeout(() => {
        timer = undefined;
        reload();
      }, 300);
    };
    return () => {
      source.close();
      if (timer) clearTimeout(timer);
      setLive(false);
    };
  }, [id, reload]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, live ? 20_000 : 2500);
    return () => clearInterval(t);
  }, [running, live, reload]);

  return { run, events, similar, error, reload };
}

// ---- actions (each throws an Error with a message that is safe to show) ----

/** Environment variables as typed by the user: one KEY=value per line, # comments allowed. They go to the sandbox only and are never stored. */
export function parseEnvText(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

export interface StartRunInput {
  owner: string;
  name: string;
  issueNumber: number;
  /** What the developer knows about the reporter: device, browser, language, location. */
  notes: string;
  /** Raw text of the environment variables box. */
  envText?: string;
  media?: MediaItem[];
}

/** Starts an investigation and returns the run id (the run continues on the server). */
export async function startRun(input: StartRunInput): Promise<string> {
  const { runId } = await api<{ runId: string }>('/api/runs', {
    method: 'POST',
    body: JSON.stringify({
      owner: input.owner,
      name: input.name,
      issueNumber: input.issueNumber,
      notes: input.notes,
      envVars: parseEnvText(input.envText ?? ''),
      media: (input.media ?? []).map((m) => ({ uri: m.uri, mimeType: m.mimeType, kind: m.kind, name: m.name })),
    }),
  });
  return runId;
}

/** Uploads a screen recording or screenshot (mp4, webm, mov, png, jpg, webp; up to 50 MB). */
export async function uploadMedia(file: File): Promise<MediaItem> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: form });
  const json = (await res.json().catch(() => ({}))) as { media?: Omit<MediaItem, 'label'>; error?: string };
  if (!res.ok || !json.media) throw new ApiError(json.error ?? 'Upload failed', res.status);
  return { ...json.media, label: file.name };
}

/** The approval gate: opens a branch and a pull request. Nothing is pushed to GitHub before this is called. */
export async function approveRun(id: string): Promise<{ prUrl: string; number: number }> {
  return api(`/api/runs/${id}/approve`, { method: 'POST' });
}

/** Asks a running investigation to stop. It ends after the step it is in (up to about two minutes) and changes nothing. */
export async function stopRun(id: string): Promise<void> {
  await api(`/api/runs/${id}/stop`, { method: 'POST' });
}

/** Revising the pull request after review comments: `start` writes a verified revision (nothing is pushed), `push` commits it to the branch, `discard` drops it. */
export async function reviseRun(id: string, action: 'start' | 'push' | 'discard'): Promise<void> {
  await api(`/api/runs/${id}/revision`, { method: 'POST', body: JSON.stringify({ action }) });
}

/** Records that the developer rejected the fix. Nothing is pushed. */
export async function rejectRun(id: string): Promise<void> {
  await api(`/api/runs/${id}/reject`, { method: 'POST' });
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}
