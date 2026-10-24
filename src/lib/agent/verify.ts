import { HARNESS_DIR, TARGET_DIR } from "../harness/scripts";
import type { AntigravitySandbox } from "../sandbox/antigravity";
import type { ExecResult, SandboxFile } from "../types";
import type { FileChange } from "./schemas";

// The verification of a fix, shared by the investigation loop and the revision of a pull request: one sandbox call that resets the clone,
// adds the test (it must be red), applies the fix, runs all tests (must be green), re-runs the matrix and prints the diff.

export const TARGET = TARGET_DIR;
export const TEST_PATH = "tests/repro.spec.js";

/** One row of the replay matrix, as the sandbox reports it (and as the run page shows it). */
export interface ProfileResult {
  name: string;
  ok: boolean;
  failure: string | null;
  pageText?: string;
  errors?: string[];
  /** The same replay in every installed engine; `ok` above is the result for the profile's own engine. */
  engines?: Record<string, { ok: boolean; failure: string | null }>;
  /** For the matrix table: how the row relates to the reporter, what its environment is, what differs. */
  kind?: string;
  env?: string;
  change?: string;
}

export function between(text: string, start: string, end: string): string | null {
  const a = text.indexOf(start);
  if (a < 0) return null;
  const b = text.indexOf(end, a + start.length);
  return b < 0 ? null : text.slice(a + start.length, b);
}

export function parseMatrix(json: string | null, r?: ExecResult): ProfileResult[] {
  if (!json) throw new Error(`Matrix produced no result${r ? ` (exit ${r.code}): ${(r.stdout + r.stderr).slice(-400)}` : ""}`);
  return JSON.parse(json) as ProfileResult[];
}

export function formatMatrix(rows: ProfileResult[]): string {
  return rows
    .map((r) => `${r.name.padEnd(16)} ${r.ok ? "PASS" : "FAIL"}${r.failure ? ` | ${r.failure}` : ""}${r.pageText ? ` | page: "${r.pageText}"` : ""}${r.errors?.length ? ` | errors: ${r.errors.join("; ")}` : ""}`)
    .join("\n");
}

export function safeRelPath(p: string): string {
  if (!/^[\w./@-]+$/.test(p) || p.includes("..") || p.startsWith("/")) throw new Error(`Unsafe path from model: ${p}`);
  return p;
}

export const count = (text: string, word: string) => Number(new RegExp(`(\\d+) ${word}`).exec(text)?.[1] ?? 0);

export interface Verification {
  red: string;
  redOk: boolean;
  green: string;
  greenExit: number;
  matrixJson: string | null;
  diff: string;
  raw: ExecResult;
}

/** `job` is the replay (plan, profiles, engines) as a sandbox file. The files are staged in a directory that is unique per call. */
export async function verifyFix(o: { sandbox: AntigravitySandbox; label: string; stage: string; testContent: string; files: FileChange[]; job: SandboxFile }): Promise<Verification> {
  // The files are written into a staging directory first (checksummed heredocs, see the sandbox); the command then copies them into place, in order.
  // A fresh directory per call: a reused sandbox keeps old staged files, and they would be copied into the repo again.
  const staged: SandboxFile[] = [
    { path: `${o.stage}/test.spec.js`, content: o.testContent },
    ...o.files.map((f) => ({ path: `${o.stage}/fix/${safeRelPath(f.path)}`, content: f.content })),
  ];
  const H = HARNESS_DIR;
  const cmd =
    `cd ${TARGET} && git checkout -- . && git clean -fdq && mkdir -p tests && cp ${o.stage}/test.spec.js ${TEST_PATH} && ` +
    `echo '@@RED@@' && (bash ${H}/test.sh ${TEST_PATH}; echo "@@REDEXIT:$?@@"); ` +
    `cp -r ${o.stage}/fix/. ${TARGET}/ && ` +
    `echo '@@GREEN@@' && (bash ${H}/test.sh; G=$?; echo "@@GREENEXIT:$G@@"; [ $G -eq 0 ] && bash ${H}/matrix.sh); ` +
    `echo '@@DIFF@@'; cd ${TARGET} && git add -N . && git diff`;
  const r = await o.sandbox.run(cmd, o.label, [...staged, o.job]);
  const red = between(r.stdout, "@@RED@@", "@@REDEXIT:") ?? "";
  const redExit = Number(/@@REDEXIT:(\d+)@@/.exec(r.stdout)?.[1] ?? -1);
  return {
    red,
    redOk: redExit > 0 && count(red, "failed") >= 1 && count(red, "passed") >= 1,
    green: between(r.stdout, "@@GREEN@@", "@@GREENEXIT:") ?? "",
    greenExit: Number(/@@GREENEXIT:(\d+)@@/.exec(r.stdout)?.[1] ?? -1),
    matrixJson: between(r.stdout, "@@RESULT@@", "@@END@@"),
    diff: r.stdout.split("@@DIFF@@")[1]?.trim() ?? "",
    raw: r,
  };
}
