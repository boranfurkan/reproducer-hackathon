import { LIMITS } from "../config";
import { TokenBudget } from "../gemini";
import { HARNESS_DIR, TARGET_DIR, harnessFiles } from "../harness/scripts";
import { AntigravitySandbox } from "../sandbox/antigravity";
import type { CallTiming, EnvProfile, ExecResult, RunEventType, SandboxFile } from "../types";
import { askJson } from "./argon";
import { ablations, baselineProfile } from "./profiles";
import { formatDigest, readRepoDigest, type RepoRef } from "./repo";
import {
  type FileChange,
  type Proposal,
  type ReplayPlan,
  type Understanding,
  proposalSchema,
  replayPlanSchema,
  understandingSchema,
} from "./schemas";

export interface Ticket {
  repo: RepoRef;
  issueNumber: number;
  title: string;
  body: string;
  /** Free text from the developer: device, browser, language, anything the issue lacks. */
  notes: string;
}

export type Emit = (type: RunEventType, summary: string, data?: unknown) => void;

interface ProfileResult {
  name: string;
  ok: boolean;
  failure: string | null;
  pageText?: string;
  errors?: string[];
}

export interface InvestigationResult {
  status: "fixed" | "not_reproduced" | "no_fix" | "stopped";
  reason?: string;
  understanding?: Understanding;
  plan?: ReplayPlan;
  matrix?: ProfileResult[];
  decisiveVariables?: string[];
  rootCause?: Pick<Proposal, "rootCause" | "file" | "explanation">;
  testContent?: string;
  fixFiles?: FileChange[];
  diff?: string;
  tokensUsed: number;
  environmentId: string | null;
  sandboxCalls: CallTiming[];
  events: { atMs: number; type: RunEventType; summary: string; detail?: string }[];
}

const SYSTEM =
  "You are ReProducer, a senior engineer who reproduces bugs that only happen in the reporter's environment " +
  "(browser engine, locale, timezone, device, storage). Be precise. Never invent files or selectors that are not in the code you are given.";

const TARGET = TARGET_DIR;
const TEST_PATH = "tests/repro.spec.js";

function between(text: string, start: string, end: string): string | null {
  const a = text.indexOf(start);
  if (a < 0) return null;
  const b = text.indexOf(end, a + start.length);
  return b < 0 ? null : text.slice(a + start.length, b);
}

function parseMatrix(json: string | null, r?: ExecResult): ProfileResult[] {
  if (!json) throw new Error(`Matrix produced no result${r ? ` (exit ${r.code}): ${(r.stdout + r.stderr).slice(-400)}` : ""}`);
  return JSON.parse(json) as ProfileResult[];
}

function formatMatrix(rows: ProfileResult[]): string {
  return rows
    .map((r) => `${r.name.padEnd(16)} ${r.ok ? "PASS" : "FAIL"}${r.failure ? ` | ${r.failure}` : ""}${r.pageText ? ` | page: "${r.pageText}"` : ""}${r.errors?.length ? ` | errors: ${r.errors.join("; ")}` : ""}`)
    .join("\n");
}

function safeRelPath(p: string): string {
  if (!/^[\w./@-]+$/.test(p) || p.includes("..") || p.startsWith("/")) throw new Error(`Unsafe path from model: ${p}`);
  return p;
}

const count = (text: string, word: string) => Number(new RegExp(`(\\d+) ${word}`).exec(text)?.[1] ?? 0);

export async function investigate(
  ticket: Ticket,
  emit: Emit,
  opts: { environmentId?: string | null; githubToken?: string } = {},
): Promise<InvestigationResult> {
  const t0 = Date.now();
  const budget = new TokenBudget();
  const sandbox = new AntigravitySandbox(budget, opts.environmentId ?? null);
  const events: InvestigationResult["events"] = [];
  const say: Emit = (type, summary, data) => {
    events.push({ atMs: Date.now() - t0, type, summary, ...(typeof data === "string" ? { detail: data.slice(-1500) } : {}) });
    emit(type, summary, data);
  };
  const out: Omit<InvestigationResult, "tokensUsed" | "environmentId" | "sandboxCalls" | "events"> = { status: "stopped" };
  const finish = (): InvestigationResult => ({
    ...out,
    tokensUsed: budget.used,
    environmentId: sandbox.environmentId,
    sandboxCalls: sandbox.calls,
    events,
  });

  const issueText = `Title: ${ticket.title}\n\n${ticket.body}`;

  // 1. In parallel: interpret the ticket, read the repo, and boot the sandbox (install, clone).
  const understandP = askJson<Understanding>({
    budget,
    system: SYSTEM,
    level: "medium",
    schema: understandingSchema,
    prompt:
      `Bug report from a GitHub issue:\n\n${issueText}\n\nDeveloper notes about the reporter's environment:\n${ticket.notes || "(none)"}\n\n` +
      "Interpret the report and rebuild the reporter's environment as a profile. Fill in only what the report states or strongly implies; " +
      "use sensible concrete values for the rest (a Turkish Chrome user on an Android phone has locale tr-TR, timezone Europe/Istanbul, a phone-sized viewport with touch). " +
      'Name the profile "reporter". In notEmulated list what Playwright cannot reproduce about this device (real GPU, OEM browser build, real network...). ' +
      "suspectedVariables: environment variables that could plausibly matter.",
  });
  const digestP = readRepoDigest(ticket.repo, opts.githubToken).then(formatDigest);
  const bootP = sandbox
    .runWith(harnessFiles(), `bash ${HARNESS_DIR}/boot.sh https://github.com/${ticket.repo.owner}/${ticket.repo.name}.git`, "boot")
    .then((boot) => {
      if (!boot.stdout.includes("BOOT_OK")) throw new Error(`Boot failed: ${(boot.stdout + boot.stderr).slice(-400)}`);
      say(
        "boot",
        `Sandbox ready${boot.stdout.includes("PW_INSTALLED") ? " (installed Playwright)" : ""}${boot.stdout.includes("NPM_INSTALLED") ? " (installed dependencies)" : ""}`,
      );
    });
  // The replay plan only needs the ticket and the code, so it runs while the sandbox is still booting.
  const planP = (async () => {
    const [understanding, code] = await Promise.all([understandP, digestP]);
    say("understood", understanding.summary, understanding);
    const reporter: EnvProfile = { ...understanding.profile, name: "reporter" };
    say("profile", `${reporter.engine}, ${reporter.locale}, ${reporter.timezoneId}, ${reporter.viewport.width}x${reporter.viewport.height}${reporter.hasTouch ? ", touch" : ""}`, reporter);
    const plan = await askJson<ReplayPlan>({
      budget,
      system: SYSTEM,
      level: "medium",
      schema: replayPlanSchema,
      prompt:
        `Repository source:\n\n${code}\n\nBug report:\n${issueText}\n\nInterpretation: ${understanding.summary}\nExpected: ${understanding.expected}\nActual: ${understanding.actual}\n\n` +
        "Write a replay plan for a headless browser that reaches the place where the bug shows and ends with assertions that describe the CORRECT behaviour, so the plan fails when the bug is present. " +
        "Actions: goto (url relative to the site root, hash routes allowed), click, fill, press, wait, expect_visible, expect_text, expect_count_min. " +
        "Use selectors that exist in the source (prefer data-testid). Keep it short.",
    });
    say("hypothesis", `Replay plan: ${plan.steps.length} steps. Success means: ${plan.successCriterion}`, plan);
    return { understanding, reporter, plan, code };
  })();
  const [{ understanding, reporter, plan, code }] = await Promise.all([planP, bootP]);
  out.understanding = understanding;
  out.plan = plan;

  // 2. Matrix: reporter, baseline, and the reporter with one variable reset at a time.
  const profiles = [reporter, baselineProfile(reporter), ...ablations(reporter).map((a) => a.profile)].slice(0, LIMITS.maxProfilesPerRound);
  const job: SandboxFile = { path: `${HARNESS_DIR}/job.json`, content: JSON.stringify({ baseUrl: "http://localhost:3100", plan, profiles }) };
  const r1 = await sandbox.runWith([job], `bash ${HARNESS_DIR}/matrix.sh`, "matrix");
  const m1 = parseMatrix(between(r1.stdout, "@@RESULT@@", "@@END@@"), r1);
  out.matrix = m1;
  say("matrix", `Matrix round 1 (${m1.length} profiles)\n${formatMatrix(m1)}`, m1);

  const rep = m1.find((r) => r.name === "reporter");
  if (!rep || rep.ok) {
    out.status = "not_reproduced";
    out.reason = "The replay passes under the reporter's profile, so the bug did not reproduce.";
    say("stopped", out.reason);
    return finish();
  }
  const decisive = m1.filter((r) => r.name.startsWith("reset-") && r.ok).map((r) => r.name.replace("reset-", ""));
  out.decisiveVariables = decisive;
  say("hypothesis", decisive.length ? `Resetting ${decisive.join(", ")} makes the bug disappear` : "No single variable explains it", decisive);

  // 3. Root cause + failing test + fix in one model call, verified in one sandbox call. Retry with the output on failure.
  const describeOpts = {
    locale: reporter.locale,
    timezoneId: reporter.timezoneId,
    viewport: reporter.viewport,
    deviceScaleFactor: reporter.deviceScaleFactor,
    hasTouch: reporter.hasTouch,
    ...(reporter.engine !== "firefox" ? { isMobile: reporter.isMobile } : {}),
  };
  let feedback = "";
  for (let attempt = 1; attempt <= LIMITS.maxFixAttempts; attempt++) {
    const p = await askJson<Proposal>({
      budget,
      system: SYSTEM,
      level: "high",
      schema: proposalSchema,
      prompt:
        `Repository source:\n\n${code}\n\nBug report:\n${issueText}\n\nReplay matrix (same steps, different environments):\n${formatMatrix(m1)}\n\n` +
        `Variables that make the bug disappear when reset to a neutral value: ${decisive.join(", ") || "none"}.\n\n` +
        "Do three things.\n" +
        "1. Find the root cause: the file, and exactly why only this environment is affected.\n" +
        `2. Write ONE Playwright test file (testContent, saved as ${TEST_PATH}; ES module importing from "@playwright/test"; baseURL is already configured and the repo's playwright config starts the site). ` +
        `It has two tests. Test 1 is inside test.describe with test.use(${JSON.stringify(describeOpts)}) and follows the replay steps and asserts the CORRECT behaviour, so it FAILS while the bug exists. ` +
        "Test 2 is the same test in a second describe with default options, which PASSES today. " +
        (reporter.engine !== "chromium"
          ? `Put test.use({ browserName: "${reporter.engine}" }) once at the top level of the file, outside every describe: Playwright rejects browserName inside a describe. `
          : "Do not set browserName (the default is already chromium). ") +
        "Use stable selectors from the source. Check each route: this app uses hash routes, so goto paths look like \"/#/category/fiction\".\n" +
        "3. Fix the bug with the smallest change that keeps behaviour for other users. Return only the files you change (path relative to the repo root, full new content). Do not edit the test." +
        (feedback ? `\n\nYour previous attempt failed verification:\n${feedback}\nCorrect it.` : ""),
    });
    if (attempt === 1) {
      out.rootCause = { rootCause: p.rootCause, file: p.file, explanation: p.explanation };
      say("root_cause", `${p.file}: ${p.rootCause}`, out.rootCause);
    }
    // Files are staged by the platform (inline sources); the command only copies them into place, in order.
    const stage = `/opt/stage/a${attempt}`;
    const staged: SandboxFile[] = [
      { path: `${stage}/test.spec.js`, content: p.testContent },
      ...p.files.map((f) => ({ path: `${stage}/fix/${safeRelPath(f.path)}`, content: f.content })),
    ];

    // Reset the clone, add the test and run it (must be red), apply the fix, run all tests (must be green), re-run the matrix, print the diff.
    const H = HARNESS_DIR;
    const verify =
      `cd ${TARGET} && git checkout -- . && git clean -fdq && mkdir -p tests && cp ${stage}/test.spec.js ${TEST_PATH} && ` +
      `echo '@@RED@@' && (bash ${H}/test.sh ${TEST_PATH}; echo "@@REDEXIT:$?@@"); ` +
      `cp -r ${stage}/fix/. ${TARGET}/ && ` +
      `echo '@@GREEN@@' && (bash ${H}/test.sh; G=$?; echo "@@GREENEXIT:$G@@"; [ $G -eq 0 ] && bash ${H}/matrix.sh); ` +
      `echo '@@DIFF@@'; cd ${TARGET} && git add -N . && git diff`;
    const r = await sandbox.run(verify, `verify-${attempt}`, [...staged, job]);

    const red = between(r.stdout, "@@RED@@", "@@REDEXIT:") ?? "";
    const redExit = Number(/@@REDEXIT:(\d+)@@/.exec(r.stdout)?.[1] ?? -1);
    const green = between(r.stdout, "@@GREEN@@", "@@GREENEXIT:") ?? "";
    const greenExit = Number(/@@GREENEXIT:(\d+)@@/.exec(r.stdout)?.[1] ?? -1);
    const redOk = redExit > 0 && count(red, "failed") >= 1 && count(red, "passed") >= 1;
    say("test_written", `Test before the fix: ${count(red, "failed")} failed, ${count(red, "passed")} passed ${redOk ? "(red as required)" : "(not the required red)"}`, red.trim());
    say("fix_attempt", `Attempt ${attempt}: ${p.fixExplanation}`, { files: p.files.map((f) => f.path) });

    const matrixJson = between(r.stdout, "@@RESULT@@", "@@END@@");
    const m2 = greenExit === 0 && matrixJson ? parseMatrix(matrixJson) : null;
    if (m2) say("matrix", `Matrix after fix\n${formatMatrix(m2)}`, m2);
    if (redOk && m2 && m2.every((x) => x.ok)) {
      out.status = "fixed";
      out.matrix = m2;
      out.testContent = p.testContent;
      out.fixFiles = p.files;
      out.diff = r.stdout.split("@@DIFF@@")[1]?.trim() ?? "";
      say("green", "All tests and every profile pass", { files: p.files.map((f) => f.path) });
      say("approval_requested", "Waiting for the developer to approve a pull request");
      return finish();
    }
    feedback = !redOk
      ? `The test must fail on the reporter profile and pass on the default profile before the fix (1 failed, 1 passed). Output before the fix:\n${red.slice(-1200)}`
      : m2
        ? `Tests pass but some profiles still fail:\n${formatMatrix(m2)}`
        : `After the fix the tests still fail:\n${green.slice(-1200)}`;
  }
  out.status = "no_fix";
  out.reason = `No verified fix after ${LIMITS.maxFixAttempts} attempts.`;
  say("stopped", out.reason);
  return finish();
}
