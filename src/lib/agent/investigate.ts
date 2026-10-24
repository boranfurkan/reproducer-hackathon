import { LIMITS } from "../config";
import { TokenBudget } from "../gemini";
import { HARNESS_DIR, harnessFiles } from "../harness/scripts";
import { matchDevices } from "../devices";
import { recallSimilar } from "../memory";
import type { MediaRef } from "../media";
import { AntigravitySandbox } from "../sandbox/antigravity";
import type { CallTiming, EnvProfile, RunEventType, SandboxFile } from "../types";
import { askJson } from "./argon";
import { ablations, baselineProfile, canonicalVariable, describeChange, describeProfile, rowKind, splitByIssue, stressorProfiles } from "./profiles";
import { formatDigest, readRepoDigest, type RepoRef } from "./repo";
import { TEST_PATH, between, count, formatMatrix, parseMatrix, verifyFix, type ProfileResult } from "./verify";
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

/** `meta.tokens` is the running token total at the moment of the event, for the live counter on the run page. */
export type Emit = (type: RunEventType, summary: string, data?: unknown, meta?: { tokens: number }) => void;

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
  /** Matrix rows that isolate the cause (shown highlighted): the reset rows that make the reporter pass, or the added condition. */
  isolatedRows?: string[];
  /** When the bug could not be reproduced: details the developer could add that would help. */
  suggestions?: string[];
  rootCause?: Pick<Proposal, "rootCause" | "file" | "explanation">;
  prTitle?: string;
  testContent?: string;
  fixFiles?: FileChange[];
  diff?: string;
  /** Everything needed to verify a changed fix later (a revision of the pull request): the replay and the profiles that must pass. */
  replay?: { plan: ReplayPlan; profiles: EnvProfile[]; engines: string[]; required: string[] };
  /** The model interaction that wrote the fix; a revision continues it (server-side conversation state). */
  proposalInteractionId?: string;
  tokensUsed: number;
  environmentId: string | null;
  sandboxCalls: CallTiming[];
  events: { atMs: number; type: RunEventType; summary: string; detail?: string }[];
}

const SYSTEM =
  "You are ReProducer, a senior engineer who reproduces bugs that only happen in the reporter's environment " +
  "(browser engine, locale, timezone, device, storage). Be precise. Never invent files or selectors that are not in the code you are given.";

export async function investigate(
  ticket: Ticket,
  emit: Emit,
  opts: {
    environmentId?: string | null;
    githubToken?: string;
    envVars?: Record<string, string>;
    shouldStop?: () => Promise<boolean>;
    /** Argon's thought summary while a step is being thought through (null when the step is done): the live "thinking" line. */
    onThinking?: (step: string, text: string | null) => void;
  } = {},
): Promise<InvestigationResult> {
  const t0 = Date.now();
  const budget = new TokenBudget();
  const sandbox = new AntigravitySandbox(budget, opts.environmentId ?? null, opts.envVars ?? {});
  const events: InvestigationResult["events"] = [];
  // Every Argon call streams its thought summary to the run page when the caller listens (docs: streaming, thinking).
  const ask = <T>(step: string, o: Parameters<typeof askJson<T>>[0]) =>
    askJson<T>(opts.onThinking ? { ...o, onThought: (text) => opts.onThinking?.(step, text) } : o).finally(() => opts.onThinking?.(step, null));
  const say: Emit = (type, summary, data) => {
    events.push({ atMs: Date.now() - t0, type, summary, ...(typeof data === "string" ? { detail: data.slice(-1500) } : {}) });
    emit(type, summary, data, { tokens: budget.used });
  };
  const out: Omit<InvestigationResult, "tokensUsed" | "environmentId" | "sandboxCalls" | "events"> = { status: "stopped" };
  const finish = (): InvestigationResult => ({
    ...out,
    tokensUsed: budget.used,
    environmentId: sandbox.environmentId,
    sandboxCalls: sandbox.calls,
    events,
  });

  const stopped = (reason: string): InvestigationResult => {
    out.status = "stopped";
    out.reason = reason;
    say("stopped", reason);
    return finish();
  };

  const issueText = `Title: ${ticket.title}\n\n${ticket.body}`;

  // 1. In parallel: interpret the ticket, read the repo, and boot the sandbox (install, clone).
  // Known devices that match the developer's notes (Atlas Search over the catalog), so "Samsung Flip Z" gets realistic numbers.
  const knownDevices = await matchDevices(ticket.notes, 3);
  if (knownDevices.length) say("hypothesis", `Device catalog matches: ${knownDevices.map((d) => d.name).join(", ")}`, knownDevices);
  const understandP = ask<Understanding>("Reading the report", {
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
    const plan = await ask<ReplayPlan>("Planning the replay", {
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
  // Every profile is replayed in every installed engine (the matrix table has a column for each).
  const job: SandboxFile = { path: `${HARNESS_DIR}/job.json`, content: JSON.stringify({ baseUrl: "http://localhost:3100", plan, profiles, engines: ["chromium", "webkit"] }) };
  const enrich = (rows: ProfileResult[]): ProfileResult[] =>
    rows.map((r) => {
      const pr = byName.get(r.name);
      return { ...r, kind: rowKind(r.name), env: pr ? describeProfile(pr) : "", change: pr ? describeChange(reporter, pr) : "" };
    });
  if (await opts.shouldStop?.()) return stopped("Stopped by you before the replay started.");
  const r1 = await sandbox.runWith([job], `bash ${HARNESS_DIR}/matrix.sh`, "matrix");
  const m1 = enrich(parseMatrix(between(r1.stdout, "@@RESULT@@", "@@END@@"), r1));
  out.matrix = m1;
  say("matrix", `Matrix round 1 (${m1.length} profiles)\n${formatMatrix(m1)}`, m1);

  // The profile that reproduces the bug: the reporter's own, or the reporter plus one extra condition.
  const rep = m1.find((r) => r.name === "reporter");
  const triggered = m1.filter((r) => r.name.startsWith("add-") && !r.ok);
  const focusRow = rep && !rep.ok ? rep : triggered[0];
  if (!focusRow) {
    out.status = "not_reproduced";
    out.reason = "The replay passes under the reporter's profile and under every extra condition tried, so the bug did not reproduce.";
    // What would help next time: specific details the developer could add, written from this case.
    try {
      const help = await ask<{ missing: string[] }>("Working out what would help", {
        budget,
        system: SYSTEM,
        level: "low",
        schema: { type: "object", properties: { missing: { type: "array", items: { type: "string" } } }, required: ["missing"] },
        prompt:
          `A bug report could not be reproduced.\n\nReport:\n${issueText}\n\nDeveloper notes about the reporter: ${ticket.notes || "(none)"}\nEnvironment that was tried: ${JSON.stringify(reporter)}\n` +
          `Extra conditions tried: ${(understanding.stressors ?? []).map((x) => x.name).join(", ") || "none"}\nReplay results:\n${formatMatrix(m1)}\n\n` +
          "List at most 3 specific pieces of information the developer could still add (about the reporter's device, browser, language, location, account or the exact steps) that would most help reproduce it. " +
          "One short sentence each. If the environment above was partly guessed, say which part. Do not repeat what is already known.",
      });
      out.suggestions = (help.missing ?? []).slice(0, 3);
    } catch {
      out.suggestions = [];
    }
    say("stopped", out.reason);
    return finish();
  }
  const focus = byName.get(focusRow.name) ?? reporter;
  // A repository can hold several bugs. A profile that failed in round 1 for a different reason than the focus (another failed step or another
  // console error) belongs to a different problem: it is reported, not required to pass, and the model is told not to fix it.
  const { required, unrelated } = splitByIssue(m1, focusRow.name);
  out.replay = { plan, profiles, engines: ["chromium", "webkit"], required: [...required] };
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
  out.isolatedRows = addedVariable ? [focusRow.name] : decisive.map((v) => `reset-${v}`);
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
  let lastInteractionId: string | undefined;
  for (let attempt = 1; attempt <= LIMITS.maxFixAttempts; attempt++) {
    if (await opts.shouldStop?.()) return stopped("Stopped by you. Nothing was changed.");
    // The first attempt sends everything. A retry continues the same interaction (server-side conversation state), so the model keeps its own
    // reasoning and the code it read, and only the verification feedback is new; if no interaction id is known it falls back to the full prompt.
    const fullPrompt =
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
        "3. Fix the bug with the smallest change that keeps behaviour for other users. Return only the files you change (path relative to the repo root, full new content). Do not edit the test.";
    const retry = attempt > 1 && lastInteractionId;
    const p = await ask<Proposal>("Finding the root cause and the fix", {
      budget,
      system: SYSTEM,
      level: "high",
      schema: proposalSchema,
      prompt: retry
        ? `Your previous attempt failed verification:\n${feedback}\nCorrect it. Answer with the same JSON as before: the root cause, the test and the fix in full.`
        : fullPrompt + (feedback ? `\n\nYour previous attempt failed verification:\n${feedback}\nCorrect it.` : ""),
      ...(retry ? { previousInteractionId: lastInteractionId } : {}),
      onInteractionId: (id) => (lastInteractionId = id),
    });
    if (attempt === 1) {
      out.rootCause = { rootCause: p.rootCause, file: p.file, explanation: p.explanation };
      out.prTitle = p.prTitle;
      say("root_cause", `${p.file}: ${p.rootCause}`, out.rootCause);
    }
    // A fresh staging directory per call (see verifyFix).
    const stage = `/opt/stage/${Date.now().toString(36)}-a${attempt}`;
    const v = await verifyFix({ sandbox, label: `verify-${attempt}`, stage, testContent: p.testContent, files: p.files, job });
    const { red, redOk, green, greenExit } = v;
    say("test_written", `Test before the fix: ${count(red, "failed")} failed, ${count(red, "passed")} passed ${redOk ? "(red as required)" : "(not the required red)"}`, red.trim());
    say("fix_attempt", `Attempt ${attempt}: ${p.fixExplanation}`, { files: p.files.map((f) => f.path) });

    const m2 = greenExit === 0 && v.matrixJson ? enrich(parseMatrix(v.matrixJson)) : null;
    if (m2) say("matrix", `Matrix after fix\n${formatMatrix(m2)}`, m2);
    if (redOk && m2 && m2.filter((x) => required.has(x.name)).every((x) => x.ok)) {
      out.status = "fixed";
      out.matrix = m2;
      out.testContent = p.testContent;
      out.fixFiles = p.files;
      out.diff = v.diff;
      out.proposalInteractionId = lastInteractionId;
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
