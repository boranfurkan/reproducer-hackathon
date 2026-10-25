import { createHash } from "node:crypto";
import type { EnvProfile } from "../types";
import type { ReplayStep } from "./schemas";
import type { ProfileResult } from "./verify";

// What a run tried and learned, kept while it works. When the run ends without a verified fix, the trail is stored as notes on the issue
// (`issue_notes`, src/lib/notes.ts), and the next run of the same issue starts from them instead of repeating the same work (D-44).

/** One environment that was replayed: a matrix row or an experiment variant, with what it showed. */
export interface TriedEnv {
  source: "matrix" | "experiment";
  name: string;
  /** How it differs from the reporter's profile ("" for the reporter itself), and the environment in short. */
  change: string;
  env: string;
  ok: boolean;
  failure?: string | null;
  error?: string;
  pageText?: string;
  engines?: Record<string, { ok: boolean; failure: string | null }>;
  /** An experiment's probe expression and the value it measured. */
  probe?: string;
  probeValue?: string;
  /** The experiment ran its own steps instead of the replay plan. */
  customSteps?: boolean;
  /** Identifies the exact experiment (environment, steps, probe): an identical experiment in a later run reuses this result. */
  key?: string;
}

export interface FixAttemptNote {
  attempt: number;
  rootCause: string;
  file: string;
  summary: string;
  /** Why verification rejected it. */
  outcome: string;
}

/** The stored form of a trail (plain data). */
export interface TrailData {
  tried: TriedEnv[];
  filesRead: string[];
  codeSearches: string[];
  webSearches: string[];
  commits: string[];
  /** The model's own reasoning lines, the last few. */
  thoughts: string[];
  hypothesis?: { rootCause: string; file: string; explanation: string };
  evidence: string[];
  missing: string[];
  fixAttempts: FixAttemptNote[];
  /** The version of the code the run read (the default branch's head commit): stored experiment results are only reused for the same code. */
  treeSha?: string;
}

const LIMITS = { tried: 80, filesRead: 80, codeSearches: 40, webSearches: 30, commits: 30, thoughts: 6 } as const;

function addOnce(list: string[], value: string, max: number) {
  const v = value.trim();
  if (v && !list.includes(v) && list.length < max) list.push(v);
}

export class Trail implements TrailData {
  tried: TriedEnv[] = [];
  filesRead: string[] = [];
  codeSearches: string[] = [];
  webSearches: string[] = [];
  commits: string[] = [];
  thoughts: string[] = [];
  hypothesis?: TrailData["hypothesis"];
  evidence: string[] = [];
  missing: string[] = [];
  fixAttempts: FixAttemptNote[] = [];
  treeSha?: string;

  file(path: string) {
    addOnce(this.filesRead, path, LIMITS.filesRead);
  }
  search(pattern: string) {
    addOnce(this.codeSearches, pattern, LIMITS.codeSearches);
  }
  web(query: string) {
    addOnce(this.webSearches, query, LIMITS.webSearches);
  }
  commit(line: string) {
    addOnce(this.commits, line, LIMITS.commits);
  }
  thought(text: string) {
    const t = text.trim().slice(0, 400);
    if (!t) return;
    this.thoughts.push(t);
    if (this.thoughts.length > LIMITS.thoughts) this.thoughts.shift();
  }
  /** Matrix rows or experiment variants with their results. `keys` maps a variant name to its experiment key. */
  rows(source: TriedEnv["source"], rows: ProfileResult[], extra: { probe?: string; customSteps?: boolean; keys?: Map<string, string> } = {}) {
    for (const r of rows) {
      if (this.tried.length >= LIMITS.tried) return;
      const entry: TriedEnv = {
        source,
        name: r.name,
        change: r.change ?? "",
        env: r.env ?? "",
        ok: r.ok,
        failure: r.failure,
        ...(r.errors?.[0] ? { error: r.errors[0].slice(0, 240) } : {}),
        ...(r.pageText ? { pageText: r.pageText.slice(0, 120) } : {}),
        ...(r.engines ? { engines: r.engines } : {}),
        ...(extra.probe ? { probe: extra.probe.slice(0, 300), probeValue: String(r.probe ?? "").slice(0, 200) } : {}),
        ...(extra.customSteps ? { customSteps: true } : {}),
        ...(extra.keys?.get(r.name) ? { key: extra.keys.get(r.name) } : {}),
      };
      // The same matrix row twice (round 1 and round 2) keeps the latest result.
      const same = source === "matrix" ? this.tried.findIndex((t) => t.source === "matrix" && t.name === r.name && t.change === entry.change) : -1;
      if (same >= 0) this.tried[same] = entry;
      else this.tried.push(entry);
    }
  }
  /** Anything worth handing over: an environment replayed, a file read, or a fix tried. */
  get empty(): boolean {
    return !this.tried.length && !this.filesRead.length && !this.fixAttempts.length && !this.hypothesis;
  }
  data(): TrailData {
    return {
      tried: this.tried,
      filesRead: this.filesRead,
      codeSearches: this.codeSearches,
      webSearches: this.webSearches,
      commits: this.commits,
      thoughts: this.thoughts,
      ...(this.hypothesis ? { hypothesis: this.hypothesis } : {}),
      evidence: this.evidence,
      missing: this.missing,
      fixAttempts: this.fixAttempts,
      ...(this.treeSha ? { treeSha: this.treeSha } : {}),
    };
  }
}

/** JSON with sorted keys, so the same profile always gives the same text. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The identity of one experiment variant: what the browser gets (the profile without its name and notes), the steps and the probe. */
export function experimentKey(profile: EnvProfile, steps: ReplayStep[], probe?: string): string {
  const { name: _name, notEmulated: _notes, ...browser } = profile;
  void _name;
  void _notes;
  return createHash("sha256").update(stable({ browser, steps, probe: probe ?? null })).digest("hex").slice(0, 20);
}

/** The notes of one earlier run, as stored. */
export interface EarlierRun extends TrailData {
  createdAt: Date;
  outcome: string;
  mode: string;
  reason?: string;
  developerNotes?: string;
  minutes: number;
}

const when = (d: Date) => new Date(d).toISOString().slice(0, 16).replace("T", " ") + " UTC";

function triedLine(t: TriedEnv): string {
  const what = t.change || "as reported";
  const result = t.ok ? "PASS" : `FAIL${t.failure ? ` at ${t.failure}` : ""}`;
  return `- ${t.source === "experiment" ? "experiment" : "matrix"} ${t.name} [${what}]${t.customSteps ? " with its own steps" : ""}: ${result}${t.error ? ` | error: ${t.error}` : ""}${t.probe ? ` | probe ${t.probe} → ${t.probeValue ?? ""}` : ""}`;
}

/** One line per earlier run, for the timeline. */
export function earlierRunSummary(n: EarlierRun): string {
  const experiments = n.tried.filter((t) => t.source === "experiment").length;
  const failing = n.tried.filter((t) => !t.ok).length;
  const parts = [
    `${n.tried.length} environment${n.tried.length === 1 ? "" : "s"} tried${experiments ? ` (${experiments} in experiments)` : ""}, ${failing} showed the bug`,
    n.filesRead.length ? `${n.filesRead.length} file${n.filesRead.length === 1 ? "" : "s"} read` : "",
    n.fixAttempts.length ? `${n.fixAttempts.length} fix${n.fixAttempts.length === 1 ? "" : "es"} rejected by verification` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}${n.hypothesis?.rootCause ? `; best explanation: ${n.hypothesis.rootCause}` : ""}`;
}

/** The conditions earlier runs already tried, in short: for the step that picks extra conditions. */
export function formatTriedShort(runs: EarlierRun[]): string {
  const seen = new Map<string, string>();
  for (const n of runs) for (const t of n.tried) if (t.change && !seen.has(t.change)) seen.set(t.change, t.ok ? "passed" : "showed the bug");
  return [...seen.entries()].slice(0, 40).map(([change, r]) => `- ${change}: ${r}`).join("\n");
}

/** Everything earlier runs learned, for the deep investigation's first prompt. Newest run first. */
export function formatEarlierRuns(runs: EarlierRun[]): string {
  return runs
    .map((n, i) => {
      const lines = [
        `--- Earlier run ${i + 1}: ${when(n.createdAt)}, ${n.mode} mode, ${n.outcome} after ${n.minutes} min${n.reason ? ` (${n.reason.slice(0, 200)})` : ""}`,
        n.developerNotes ? `Developer notes then: ${n.developerNotes.slice(0, 400)}` : "",
        n.tried.length ? `Environments tried (FAIL means the bug showed):\n${n.tried.slice(0, 40).map(triedLine).join("\n")}` : "",
        n.filesRead.length ? `Files read: ${n.filesRead.slice(0, 40).join(", ")}` : "",
        n.codeSearches.length ? `Code searches: ${n.codeSearches.slice(0, 20).map((s) => `/${s}/`).join(", ")}` : "",
        n.commits.length ? `Commits read: ${n.commits.slice(0, 15).join("; ")}` : "",
        n.webSearches.length ? `Web searches: ${n.webSearches.slice(0, 15).join("; ")}` : "",
        n.hypothesis?.rootCause ? `Best explanation it reached: ${n.hypothesis.rootCause}${n.hypothesis.file ? ` (${n.hypothesis.file})` : ""}. ${n.hypothesis.explanation ?? ""}` : "",
        n.evidence.length ? `Evidence it had: ${n.evidence.slice(0, 6).join("; ")}` : "",
        n.missing.length ? `What it said was still missing: ${n.missing.join("; ")}` : "",
        n.fixAttempts.length ? `Fixes it tried that verification rejected:\n${formatFixAttempts([n])}` : "",
        n.thoughts.length ? `Its last thoughts: ${n.thoughts.slice(-3).join(" / ")}` : "",
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");
}

/** Fixes earlier runs tried and why verification rejected them: for the fix step. */
export function formatFixAttempts(runs: EarlierRun[]): string {
  return runs
    .flatMap((n) => n.fixAttempts)
    .slice(0, 6)
    .map((f) => `- ${f.file}: ${f.summary.slice(0, 240)} (rejected: ${f.outcome.slice(0, 240)})`)
    .join("\n");
}

/** Stored experiment results that a new run may reuse: only from runs that saw the same code. */
export function reusableResults(runs: EarlierRun[], treeSha?: string): Map<string, TriedEnv> {
  const out = new Map<string, TriedEnv>();
  if (!treeSha) return out;
  for (const n of runs) {
    if (n.treeSha !== treeSha) continue;
    for (const t of n.tried) if (t.key && !out.has(t.key)) out.set(t.key, t);
  }
  return out;
}
