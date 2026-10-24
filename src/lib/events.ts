import { ObjectId } from "mongodb";
import type { Emit, InvestigationResult, Ticket } from "./agent/investigate";
import { collection } from "./mongo";
import { redact, redactDeep } from "./redact";
import type { RunEventType } from "./types";

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
  sandboxCalls?: { label: string; ms: number; tokens: number }[];
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
export async function startRun(ticket: Ticket, secrets: string[] = []) {
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
  };

  const close = async (patch: Partial<RunDoc>) => {
    await Promise.all(pending);
    await runs.updateOne({ _id: runId }, { $set: { ...patch, finishedAt: new Date() } });
  };

  return {
    runId,
    emit,
    finish: (r: InvestigationResult) =>
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
            sandboxCalls: r.sandboxCalls,
          },
          secrets,
        ),
      ),
    fail: (e: unknown) => close({ status: "failed", reason: redact(e instanceof Error ? e.message : String(e), secrets) }),
  };
}
