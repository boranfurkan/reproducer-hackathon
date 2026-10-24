import { ObjectId } from "mongodb";
import type { Emit, InvestigationResult, Ticket } from "./agent/investigate";
import { collection } from "./mongo";
import { recordMemory } from "./memory";
import { redact, redactDeep } from "./redact";
import type { EnvProfile, RunEventType } from "./types";

export interface RunDoc {
  _id: ObjectId;
  repo: string;
  issueNumber: number;
  title: string;
  /** Developer notes, redacted. */
  notes: string;
  status: "running" | "fixed" | "not_reproduced" | "no_fix" | "stopped" | "failed";
  reason?: string;
  createdAt: Date;
  finishedAt?: Date;
  tokensUsed?: number;
  environmentId?: string | null;
  decisiveVariables?: string[];
  rootCause?: { rootCause: string; file: string; explanation: string };
  diff?: string;
  /** Who started the run (GitHub login). */
  userLogin?: string;
  issueUrl?: string;
  /** The reporter's environment profile and the final matrix, for the approval card and the PR text. */
  profile?: EnvProfile;
  matrix?: { name: string; ok: boolean; failure: string | null }[];
  understandingSummary?: string;
  /** Other failing profiles seen while investigating (probably other bugs), shown on the run page and in the PR text. */
  otherProblems?: { profile: string; problem: string }[];
  /** What the pull request will contain. */
  /** Short pull request title written by the model. */
  prTitle?: string;
  testContent?: string;
  fixFiles?: { path: string; content: string }[];
  prUrl?: string;
  prNumber?: number;
  prBranch?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  sandboxCalls?: { label: string; ms: number; tokens: number }[];
}

/**
 * One document per investigation, written when the reporter's environment is known. An Atlas Stream Processing job reads these inserts
 * (change stream), counts reports per environment in a time window and writes alerts to `ticket_clusters` (docs/STREAM-PROCESSING.md).
 */
export interface TicketDoc {
  runId: ObjectId;
  userLogin?: string;
  repo: string;
  issueNumber: number;
  title: string;
  createdAt: Date;
  environment: { engine: string; locale: string; timezoneId: string; mobile: boolean };
}

/** Written when a developer approves a pull request. */
export interface ApprovalDoc {
  runId: ObjectId;
  login: string;
  at: Date;
  prUrl: string;
  branch: string;
}

export interface RunEventDoc {
  runId: ObjectId;
  at: Date;
  /** Order of emission within the run. Timestamps can tie, so the timeline sorts by this. */
  seq: number;
  /** Milliseconds since the run started, for the timeline. */
  atMs: number;
  type: RunEventType;
  summary: string;
  data?: unknown;
}

/** Keep stored event payloads small; the full result lives on the run. */
const MAX_DATA_CHARS = 8_000;
function clip(data: unknown, secrets: string[]): unknown {
  if (data === undefined) return undefined;
  const safe = redactDeep(data, secrets);
  const json = JSON.stringify(safe);
  return json.length > MAX_DATA_CHARS ? { truncated: true, preview: json.slice(0, MAX_DATA_CHARS) } : safe;
}

/**
 * Creates the run document and returns an `emit` that stores every event in `run_events` (redacted),
 * plus `finish`/`fail` to close the run. Event writes never throw into the investigation: a failed write is logged.
 */
export async function startRun(ticket: Ticket, secrets: string[] = [], meta: { userLogin?: string; issueUrl?: string } = {}) {
  const runs = await collection<RunDoc>("runs");
  const events = await collection<RunEventDoc>("run_events");
  const t0 = Date.now();
  const runId = new ObjectId();
  await runs.insertOne({
    _id: runId,
    repo: `${ticket.repo.owner}/${ticket.repo.name}`,
    issueNumber: ticket.issueNumber,
    title: ticket.title,
    notes: redact(ticket.notes, secrets),
    status: "running",
    createdAt: new Date(),
    ...meta,
  });

  const pending: Promise<unknown>[] = [];
  let seq = 0;
  const emit: Emit = (type, summary, data) => {
    const doc: RunEventDoc = {
      runId,
      at: new Date(),
      seq: seq++,
      atMs: Date.now() - t0,
      type,
      summary: redact(summary, secrets),
      data: clip(data, secrets),
    };
    pending.push(events.insertOne(doc).catch((e) => console.error("run_events write failed:", (e as Error).message)));
    // The profile event is the first moment the reporter's environment is known: record the ticket for the stream processor.
    if (type === "profile" && data && typeof data === "object") {
      const p = data as Partial<EnvProfile>;
      pending.push(
        collection<TicketDoc>("tickets")
          .then((c) =>
            c.insertOne({
              runId,
              userLogin: meta.userLogin,
              repo: `${ticket.repo.owner}/${ticket.repo.name}`,
              issueNumber: ticket.issueNumber,
              title: redact(ticket.title, secrets),
              createdAt: new Date(),
              environment: { engine: String(p.engine ?? "unknown"), locale: String(p.locale ?? "unknown"), timezoneId: String(p.timezoneId ?? "unknown"), mobile: !!p.isMobile },
            }),
          )
          .catch((e) => console.error("tickets write failed:", (e as Error).message)),
      );
    }
  };

  const close = async (patch: Partial<RunDoc>) => {
    await Promise.all(pending);
    await runs.updateOne({ _id: runId }, { $set: { ...patch, finishedAt: new Date() } });
  };

  const finishRun = (r: InvestigationResult) =>
    close(
      redactDeep(
        {
          status: r.status,
          reason: r.reason,
          tokensUsed: r.tokensUsed,
          environmentId: r.environmentId,
          decisiveVariables: r.decisiveVariables,
          rootCause: r.rootCause,
          diff: r.diff,
          profile: r.understanding?.profile,
          matrix: r.matrix?.map((m) => ({ name: m.name, ok: m.ok, failure: m.failure })),
          understandingSummary: r.understanding?.summary,
          otherProblems: r.otherProblems,
          prTitle: r.prTitle,
          testContent: r.testContent,
          fixFiles: r.fixFiles,
          sandboxCalls: r.sandboxCalls,
        },
        secrets,
      ),
    );

  return {
    runId,
    emit,
    finish: async (r: InvestigationResult) => {
      await finishRun(r);
      // A verified fix goes into the memory. A failure to store it must not fail the run.
      if (r.status === "fixed" && r.rootCause && r.diff && r.focusProfile) {
        const f = r.focusProfile;
        await recordMemory({
          runId,
          repo: `${ticket.repo.owner}/${ticket.repo.name}`,
          issueNumber: ticket.issueNumber,
          title: redact(ticket.title, secrets),
          symptom: r.understanding?.summary ?? "",
          rootCause: r.rootCause.rootCause,
          file: r.rootCause.file,
          explanation: r.rootCause.explanation,
          isolatedVariable: r.decisiveVariables?.[0] ?? "unknown",
          environment: { engine: f.engine, locale: f.locale, timezoneId: f.timezoneId, storageBlocked: !!f.storageBlocked, mobile: f.isMobile },
          diff: r.diff,
        }).catch((e) => console.error("recordMemory failed:", (e as Error).message));
      }
    },
    fail: (e: unknown) => close({ status: "failed", reason: redact(e instanceof Error ? e.message : String(e), secrets) }),
  };
}
