import type { ObjectId } from "mongodb";
import { earlierRunSummary, type EarlierRun, type Trail, type TrailData } from "./agent/trail";
import { collection } from "./mongo";
import { redact, redactDeep } from "./redact";

// Notes on an issue from runs that did not end with a verified fix (not reproduced, no fix, stopped, out of time or failed): what each
// tried and learned. The next run of the same issue reads them, so it builds on that work instead of repeating it, and an experiment it
// already ran on the same code returns the stored result. A verified fix resolves the notes of its issue (D-44).

export interface IssueNoteDoc extends TrailData {
  _id?: ObjectId;
  runId: ObjectId;
  repo: string;
  issueNumber: number;
  createdAt: Date;
  userLogin?: string;
  outcome: "not_reproduced" | "no_fix" | "stopped" | "failed";
  mode: "deep" | "quick";
  reason?: string;
  developerNotes: string;
  minutes: number;
  tokens: number;
  /** One line for the timeline. */
  summary: string;
  /** Set when a later run fixed the issue: resolved notes are no longer handed to new runs. */
  resolvedAt?: Date;
  resolvedBy?: ObjectId;
}

/** Store what a run that did not fix its issue tried and learned. Returns the stored notes, or null when the run had nothing to hand over. */
export async function recordIssueNotes(
  meta: Pick<IssueNoteDoc, "runId" | "repo" | "issueNumber" | "userLogin" | "outcome" | "mode" | "reason" | "developerNotes" | "minutes" | "tokens">,
  trail: Trail,
  secrets: string[] = [],
): Promise<IssueNoteDoc | null> {
  if (trail.empty) return null;
  // Only the text is redacted: redactDeep rebuilds objects, which would turn the ObjectId and the dates into empty objects.
  const { runId, ...rest } = meta;
  const doc: IssueNoteDoc = {
    ...redactDeep({ ...trail.data(), ...rest, reason: meta.reason?.slice(0, 600) }, secrets),
    runId,
    createdAt: new Date(),
    summary: "",
  };
  doc.summary = redact(earlierRunSummary(doc), secrets);
  await (await collection<IssueNoteDoc>("issue_notes")).insertOne(doc);
  return doc;
}

/** The notes of earlier unfinished runs of this issue, newest first. Empty on any failure: notes can only add to a run. */
export async function loadIssueNotes(repo: string, issueNumber: number, limit = 3): Promise<EarlierRun[]> {
  try {
    const notes = await collection<IssueNoteDoc>("issue_notes");
    return await notes.find({ repo, issueNumber, resolvedAt: { $exists: false } }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray();
  } catch (e) {
    console.error("loadIssueNotes failed:", (e as Error).message);
    return [];
  }
}

/** A verified fix of the issue: earlier notes are history now. */
export async function resolveIssueNotes(repo: string, issueNumber: number, runId: ObjectId): Promise<void> {
  const notes = await collection<IssueNoteDoc>("issue_notes");
  await notes.updateMany({ repo, issueNumber, resolvedAt: { $exists: false } }, { $set: { resolvedAt: new Date(), resolvedBy: runId } });
}
