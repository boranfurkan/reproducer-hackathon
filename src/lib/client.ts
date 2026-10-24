// Small helpers and shared shapes for the browser side.

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status);
  return json;
}

export interface SessionUser {
  login: string;
  name: string | null;
  avatar: string;
}

export interface RepoItem {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  openIssues: number;
  updatedAt: string | null;
}

export interface IssueItem {
  number: number;
  title: string;
  body: string;
  author: string | null;
  createdAt: string;
  comments: number;
  url: string;
}

export interface MatrixRow {
  name: string;
  /** The result in the profile's own engine. */
  ok: boolean;
  failure?: string | null;
  pageText?: string;
  errors?: string[];
  /** The same replay in each engine, for the matrix table's columns. */
  engines?: Record<string, { ok: boolean; failure: string | null }>;
  /** "as reported", "neutral", "reset one" or "added". */
  kind?: string;
  /** One line describing the environment of the row. */
  env?: string;
  /** What differs from the reporter ("en-US instead of tr-TR"). */
  change?: string;
}

export interface TimelineEvent {
  seq: number;
  atMs: number;
  /** Running token total when it happened. */
  tokens?: number;
  type: string;
  summary: string;
  data?: unknown;
}

export interface RunView {
  _id: string;
  repo: string;
  issueNumber: number;
  title: string;
  status: 'running' | 'fixed' | 'not_reproduced' | 'no_fix' | 'stopped' | 'failed';
  reason?: string;
  createdAt: string;
  finishedAt?: string;
  tokensUsed?: number;
  decisiveVariables?: string[];
  rootCause?: { rootCause: string; file: string; explanation: string };
  diff?: string;
  testContent?: string;
  profile?: {
    engine: string;
    locale: string;
    timezoneId: string;
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    notEmulated?: string[];
    storageBlocked?: boolean;
  };
  notes?: string;
  tokenCap?: number;
  attachments?: { kind: string; name: string }[];
  matrix?: MatrixRow[];
  isolatedRows?: string[];
  suggestions?: string[];
  stopRequested?: boolean;
  prTitle?: string;
  fixFiles?: { path: string; content: string }[];
  prUrl?: string;
  prNumber?: number;
  rejectedAt?: string;
  issueUrl?: string;
  otherProblems?: { profile: string; problem: string }[];
}

export interface MediaItem {
  uri: string;
  mimeType: string;
  kind: 'video' | 'image';
  name: string;
  label: string;
}

export interface SimilarFix {
  id: string;
  repo: string;
  issueNumber: number;
  title: string;
  file: string;
  isolatedVariable?: string;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface ClusterAlert {
  repo?: string;
  engine?: string;
  locale?: string;
  count: number;
  users: number;
  lastAt: string | null;
}

export interface MemoryFacets {
  total: number;
  variable: FacetBucket[];
  engine: FacetBucket[];
  locale: FacetBucket[];
}

export const ago = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

/** Two letters for an avatar: the initials of a name ("Boran Furkan" gives "bf"), else the first two letters of the login. */
export const initials = (name: string | null | undefined, login: string): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : login.slice(0, 2);
  return letters.toLowerCase();
};

/** Added and removed lines and files in a unified diff. */
export const diffStats = (diff: string): { files: number; added: number; removed: number } => {
  const lines = diff.split('\n');
  return {
    files: lines.filter((l) => l.startsWith('diff --git')).length,
    added: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length,
    removed: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length,
  };
};

/** "4 min 26 s", "1:28": elapsed time for the run header. */
export const formatDuration = (ms: number): string => (ms < 90_000 ? `${Math.max(0, Math.round(ms / 1000))} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);
export const formatClock = (ms: number): string => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

/** 77_000 gives "77k". */
export const kilo = (n: number | undefined): string => (n === undefined ? '' : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** A unified diff cut into one block per file. */
export function splitDiff(diff: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const line of diff.split('\n')) {
    const m = /^diff --git a\/(\S+)/.exec(line);
    if (m) out.push({ path: m[1], text: line });
    else if (out.length) out[out.length - 1].text += `\n${line}`;
  }
  return out;
}

/** The test file the agent adds; it is shown in its own block, not in the change. */
export const TEST_FILE = 'tests/repro.spec.js';
