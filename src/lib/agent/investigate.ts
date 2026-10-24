import { LIMITS } from "../config";
import { TokenBudget } from "../gemini";
import { HARNESS_DIR, TARGET_DIR, harnessFiles } from "../harness/scripts";
import { matchDevices } from "../devices";
import { recallSimilar } from "../memory";
import type { MediaRef } from "../media";
import { AntigravitySandbox } from "../sandbox/antigravity";
import type { CallTiming, EnvProfile, ExecResult, RunEventType, SandboxFile } from "../types";
import { askJson } from "./argon";
import { ablations, baselineProfile, canonicalVariable, splitByIssue, stressorProfiles } from "./profiles";
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
  /** Optional screen recording or screenshots from the reporter. */
  media?: MediaRef[];
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
  /** The profile under which the bug reproduced (the reporter's, or the reporter plus one extra condition). */
  focusProfile?: EnvProfile;
  /** Profiles that failed for a different reason than this issue: probably other bugs in the same repository. */
  otherProblems?: { profile: string; problem: string }[];
  rootCause?: Pick<Proposal, "rootCause" | "file" | "explanation">;
  prTitle?: string;
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
  opts: { environmentId?: string | null; githubToken?: string; envVars?: Record<string, string> } = {},
): Promise<InvestigationResult> {
  const t0 = Date.now();
  const budget = new TokenBudget();
  const sandbox = new AntigravitySandbox(budget, opts.environmentId ?? null, opts.envVars ?? {});
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
  // Known devices that match the developer's notes (Atlas Search over the catalog), so "Samsung Flip Z" gets realistic numbers.
  const knownDevices = await matchDevices(ticket.notes, 3);
  if (knownDevices.length) say("hypothesis", `Device catalog matches: ${knownDevices.map((d) => d.name).join(", ")}`, knownDevices);
  const understandP = askJson<Understanding>({
    budget,
    system: SYSTEM,
    level: "medium",
    schema: understandingSchema,
    media: ticket.media,
    prompt:
      `Bug report from a GitHub issue:\n\n${issueText}\n\nDeveloper notes about the reporter's environment:\n${ticket.notes || "(none)"}\n\n` +
      (ticket.media?.length
        ? "A screen recording or screenshot from the reporter is attached. Watch it: in mediaObservations list the exact steps the user takes, what they see that is wrong, and every clue about their environment " +
          "(interface language, screen size and orientation, device type, browser chrome). Treat those clues as evidence when you build the profile. "
        : 'Leave mediaObservations as an empty string (no recording was attached). ') +
      "Interpret the report and rebuild the reporter's environment as a profile. Fill in only what the report states or strongly implies; " +
      "use sensible concrete values for the rest (a Turkish Chrome user on an Android phone has locale tr-TR, timezone Europe/Istanbul, a phone-sized viewport with touch). " +
      'Name the profile "reporter". In notEmulated list what Playwright cannot reproduce about this device (real GPU, OEM browser build, real network...). ' +
      (knownDevices.length
        ? `Known device profiles that may match the notes (best match first). When one fits, use its engine, viewport, deviceScaleFactor, isMobile, hasTouch and notEmulated exactly; ignore any that do not fit:\n${JSON.stringify(knownDevices)}\n`
        : "") +
      "suspectedVariables: environment variables that could plausibly matter. " +
      "stressors: up to 3 extra conditions that the report does NOT state but that could plausibly explain why only some users are affected " +
      "(for example storage blocked in private or in-app browsers, a different timezone or locale, dark mode, reduced motion). " +
      "Each is tried on top of the reporter's profile, so only use values that differ from it. Use IANA timezones and BCP 47 locales.",
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
        `Repository source:\n\n${code}\n\nBug report:\n${issueText}\n\nInterpretation: ${understanding.summary}\n${understanding.mediaObservations ? `What the reporter's recording shows: ${understanding.mediaObservations}\n` : ""}Expected: ${understanding.expected}\nActual: ${understanding.actual}\n\n` +
        "Write a replay plan for a headless browser that reaches the place where the bug shows and ends with assertions that describe the CORRECT behaviour, so the plan fails when the bug is present. " +
        "Actions: goto (url relative to the site root, hash routes allowed), click, fill, press, wait, expect_visible, expect_text, expect_count_min. " +
        "Use selectors that exist in the source (prefer data-testid). Keep it short. Always fill successCriterion with one sentence saying what the final assertions check. " +
        "The same plan is replayed under many locales, timezones and devices, so every assertion must hold in ALL of them when the app is correct: " +
        "never rely on words, month names or date formats of one language. expect_text accepts a regular expression written as /pattern/ (for example /\\b5\\b/ to check that a day number is 5); prefer that for dates, numbers and prices.",
    });
    say("hypothesis", `Replay plan: ${plan.steps.length} steps. Success means: ${plan.successCriterion}`, plan);
    return { understanding, reporter, plan, code };
  })();
  const [{ understanding, reporter, plan, code }] = await Promise.all([planP, bootP]);
  out.understanding = understanding;
  out.plan = plan;

  // 2. Matrix: the reporter, a neutral baseline, the reporter with one variable reset at a time (is the cause something it already has?),
  //    and the reporter with one extra condition added (is the cause something the report never mentioned?).
  const stress = stressorProfiles(reporter, understanding.stressors ?? [], 3);
  const stressText = (understanding.stressors ?? []).map((x) => `${x.name} (${x.why})`).join("; ");
  if (stress.length) say("hypothesis", `Extra conditions to try on top of the reporter's profile: ${stressText}`, understanding.stressors);
  const profiles = [reporter, baselineProfile(reporter), ...ablations(reporter).map((a) => a.profile).slice(0, 4), ...stress].slice(0, LIMITS.maxProfilesPerRound);
  const byName = new Map(profiles.map((pr) => [pr.name, pr]));
  const job: SandboxFile = { path: `${HARNESS_DIR}/job.json`, content: JSON.stringify({ baseUrl: "http://localhost:3100", plan, profiles }) };
  const r1 = await sandbox.runWith([job], `bash ${HARNESS_DIR}/matrix.sh`, "matrix");
  const m1 = parseMatrix(between(r1.stdout, "@@RESULT@@", "@@END@@"), r1);
  out.matrix = m1;
  say("matrix", `Matrix round 1 (${m1.length} profiles)\n${formatMatrix(m1)}`, m1);

  // The profile that reproduces the bug: the reporter's own, or the reporter plus one extra condition.
  const rep = m1.find((r) => r.name === "reporter");
  const triggered = m1.filter((r) => r.name.startsWith("add-") && !r.ok);
  const focusRow = rep && !rep.ok ? rep : triggered[0];
  if (!focusRow) {
    out.status = "not_reproduced";
    out.reason = "The replay passes under the reporter's profile and under every extra condition tried, so the bug did not reproduce.";
    say("stopped", out.reason);
    return finish();
  }
  const focus = byName.get(focusRow.name) ?? reporter;
  // A repository can hold several bugs. A profile that failed in round 1 for a different reason than the focus (another failed step or another
  // console error) belongs to a different problem: it is reported, not required to pass, and the model is told not to fix it.
  const { required, unrelated } = splitByIssue(m1, focusRow.name);
  out.otherProblems = unrelated.map((r) => ({ profile: r.name, problem: r.errors?.[0] || r.failure || "fails" }));
  if (unrelated.length) {
    say(
      "hypothesis",
      `Other problems seen while investigating, not part of this issue: ${unrelated.map((r) => `${r.name} (${r.errors?.[0] || r.failure || "fails"})`).join("; ")}`,
      unrelated,
    );
  }
  // What isolates the bug, in canonical names: the variables whose reset makes the reporter pass, or the one condition that was added.
  const addedVariable = focusRow.name === "reporter" ? null : canonicalVariable(reporter, focus);
  const decisive = addedVariable ? [addedVariable] : m1.filter((r) => r.name.startsWith("reset-") && r.ok).map((r) => r.name.replace("reset-", ""));
  out.decisiveVariables = decisive;
  out.focusProfile = focus;
  say(
    "hypothesis",
    addedVariable
      ? `The reporter's profile passes, but adding ${addedVariable} (${focusRow.name.replace("add-", "")}) reproduces the bug`
      : decisive.length ? `Resetting ${decisive.join(", ")} makes the bug disappear` : "No single variable explains it",
    decisive,
  );

  // 3. Root cause + failing test + fix in one model call, verified in one sandbox call. Retry with the output on failure.
  const describeOpts = {
    locale: focus.locale,
    timezoneId: focus.timezoneId,
    viewport: focus.viewport,
    deviceScaleFactor: focus.deviceScaleFactor,
    hasTouch: focus.hasTouch,
    ...(focus.engine !== "firefox" ? { isMobile: focus.isMobile } : {}),
    ...(focus.colorScheme ? { colorScheme: focus.colorScheme } : {}),
    ...(focus.reducedMotion ? { reducedMotion: "reduce" } : {}),
  };
  const storageSnippet =
    "test.beforeEach(async ({ context }) => { await context.addInitScript(() => { const t = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); }; " +
    "Object.defineProperty(window, 'localStorage', { get: t }); Object.defineProperty(window, 'sessionStorage', { get: t }); }); });";
  // Have we seen something like this before? Hybrid search over the memory of past verified fixes; the hits are hints, not answers.
  const recallQuery = `${understanding.summary} Only affects: ${decisive.join(", ") || "unknown"}. Environment: ${focus.engine}, ${focus.locale}, ${focus.timezoneId}${focus.storageBlocked ? ", storage blocked" : ""}.`;
  const past = await recallSimilar(recallQuery, 3);
  if (past.length) {
    say("memory", `Seen something similar before: ${past.map((h) => `${h.title} (${h.file}, isolated by ${h.isolatedVariable})`).join("; ")}`, past);
  } else {
    say("memory", "No similar past bug in memory yet");
  }
  const pastText = past.length
    ? `\n\nSimilar bugs fixed before (hints only; check them against THIS code):\n${past.map((h) => `- ${h.title}: ${h.rootCause} (file ${h.file}, isolated by ${h.isolatedVariable})`).join("\n")}\n`
    : "";

  let feedback = "";
  for (let attempt = 1; attempt <= LIMITS.maxFixAttempts; attempt++) {
    const p = await askJson<Proposal>({
      budget,
      system: SYSTEM,
      level: "high",
      schema: proposalSchema,
      prompt:
        `Repository source:\n\n${code}\n\nBug report:\n${issueText}\n\nReplay matrix (same steps, different environments):\n${formatMatrix(m1)}\n\n` +
        `Failing profile (the one the test must use): ${JSON.stringify(focus)}\nWhat isolates the bug: ${addedVariable ? `adding ${addedVariable} to the reporter's profile` : decisive.join(", ") || "nothing single"}.${pastText}${unrelated.length ? `\nThese profiles fail for a DIFFERENT reason and are NOT part of this issue; do not fix them: ${unrelated.map((r) => r.name).join(", ")}.` : ""}\n\n` +
        "Do three things.\n" +
        "1. Find the root cause. rootCause: ONE sentence of at most 160 characters, without the file name (file goes in the file field). explanation: two to four sentences on the mechanism and exactly why only this environment is affected, without repeating the rootCause sentence. prTitle: a short imperative pull request title of at most 65 characters, plain text, no backticks and no file paths (for example \"Use locale-independent upper-casing for category keys\").\n" +
        `2. Write ONE Playwright test file (testContent, saved as ${TEST_PATH}; ES module importing from "@playwright/test"; baseURL is already configured and the repo's playwright config starts the site). ` +
        `It has two tests. Test 1 is inside test.describe with test.use(${JSON.stringify(describeOpts)}) and follows the replay steps and asserts the CORRECT behaviour, so it FAILS while the bug exists. ` +
        "Test 2 is the same test in a second describe with default options, which PASSES today. " +
        (focus.engine !== "chromium"
          ? `Put test.use({ browserName: "${focus.engine}" }) once at the top level of the file, outside every describe: Playwright rejects browserName inside a describe. `
          : "Do not set browserName (the default is already chromium). ") +
        (focus.storageBlocked ? `Storage is blocked in the failing environment: inside the failing describe, include exactly this hook so localStorage and sessionStorage throw like they do there: ${storageSnippet} ` : "") +
        "Use stable selectors from the source. Check each route: this app uses hash routes, so goto paths look like \"/#/category/fiction\".\n" +
        "3. Fix the bug with the smallest change that keeps behaviour for other users. Return only the files you change (path relative to the repo root, full new content). Do not edit the test." +
        (feedback ? `\n\nYour previous attempt failed verification:\n${feedback}\nCorrect it.` : ""),
    });
    if (attempt === 1) {
      out.rootCause = { rootCause: p.rootCause, file: p.file, explanation: p.explanation };
      out.prTitle = p.prTitle;
      say("root_cause", `${p.file}: ${p.rootCause}`, out.rootCause);
    }
    // The files are written into a staging directory first (checksummed heredocs, see the sandbox); the command then copies them into place, in order.
    // A fresh directory per call: a reused sandbox keeps old staged files, and they would be copied into the repo again.
    const stage = `/opt/stage/${Date.now().toString(36)}-a${attempt}`;
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
    if (redOk && m2 && m2.filter((x) => required.has(x.name)).every((x) => x.ok)) {
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
        ? `Tests pass but some profiles that must pass still fail:\n${formatMatrix(m2.filter((x) => required.has(x.name)))}`
        : `After the fix the tests still fail:\n${green.slice(-1200)}`;
  }
  out.status = "no_fix";
  out.reason = `No verified fix after ${LIMITS.maxFixAttempts} attempts.`;
  say("stopped", out.reason);
  return finish();
}
