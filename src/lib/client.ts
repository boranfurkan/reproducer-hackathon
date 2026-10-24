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
  ok: boolean;
  failure?: string | null;
  pageText?: string;
  errors?: string[];
}

export interface TimelineEvent {
  seq: number;
  atMs: number;
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
  profile?: { engine: string; locale: string; timezoneId: string; notEmulated?: string[]; storageBlocked?: boolean };
  prUrl?: string;
  prNumber?: number;
  rejectedAt?: string;
  issueUrl?: string;
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
