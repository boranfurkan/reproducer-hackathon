import { LIMITS, MODELS } from "../config";
import { TokenBudget, gemini, withRetry } from "../gemini";
import { REMOVABLE_APIS, withInitScripts } from "../harness/conditions";
import { HARNESS_DIR } from "../harness/scripts";
import type { AntigravitySandbox } from "../sandbox/antigravity";
import type { EnvProfile, SandboxFile } from "../types";
import type { Emit } from "./investigate";
import { applyOverrides, describeChange, describeProfile, slugOf } from "./profiles";
import { type RepoTree, gitLog, gitShow } from "./repo";
import { type ReplayPlan, type ReplayStep, type Stressor, type Understanding, replayPlanSchema, stressorSchema } from "./schemas";
import { between, formatMatrix, parseMatrix, type ProfileResult } from "./verify";

// The deep investigation: Argon works on the bug the way a senior engineer would, for as long as it takes (up to about half an hour).
// It starts with everything in one context, the application's code, its whole git history and the full source of the framework and
// library files the failing page loads (often several hundred thousand tokens of Argon's 1M window), and then runs a loop of tool calls:
//   read_file, search_code      any file of the repository, vendored framework source included
//   git_log, git_show           when and how the code changed
//   run_experiment              replay in real browsers in the sandbox under environment variants of its choosing, with an optional probe
//                               (a JavaScript expression measured in the page: a computed style, whether an API exists, the DOM state)
//   google_search, url_context  known framework and browser behaviour, release notes, issue trackers (built-in tools)
//   conclude                    the variant that reproduces the bug, the mechanism and the evidence
// Every step is written to the timeline. The conversation is one interaction chain (previous_interaction_id), so the large context is
// served from the cache on every later turn, and the fix proposal continues the same chain with everything the investigation learned.

const MAX_ROUNDS = 36;
const MAX_EXPERIMENTS = 12;
const MAX_MINUTES = 32;
const MAX_PRELOAD_CHARS = 2_400_000;

export interface DeepInput {
  issueText: string;
  notes: string;
  understanding: Understanding;
  reporter: EnvProfile;
  plan: ReplayPlan;
  round1: ProfileResult[];
  /** Every profile of round 1 by name, so a conclusion can point at a matrix row. */
  known: Map<string, EnvProfile>;
  code: string;
  tree: RepoTree;
  githubToken?: string;
  sandbox: AntigravitySandbox;
  budget: TokenBudget;
  say: Emit;
  think: (step: string, text: string | null) => void;
  shouldStop?: () => Promise<boolean>;
}

export interface DeepResult {
  interactionId?: string;
  reproduced: boolean;
  /** The profile that reproduces the bug (a round-1 row, the reporter, or a variant found by experiment). */
  focus?: EnvProfile;
  /** Whether an experiment or the matrix actually saw that profile fail. */
  confirmed: boolean;
  /** The steps of the experiment that reproduced it, when they differ from the replay plan (they become the replay for verification). */
  steps?: ReplayStep[];
  hypothesis?: { rootCause: string; file: string; explanation: string };
  evidence: string[];
  missing: string[];
  stats: { rounds: number; experiments: number; filesRead: number; searches: number; webSearches: number; contextTokens: number; minutes: number };
  stoppedReason?: string;
}

const overrideSchema = stressorSchema.properties.override;

const tools = [
  {
    type: "function",
    name: "read_file",
    description: "Read a file of the repository, including vendored framework and library files. For a large file give start_line and end_line (1-based, inclusive) to read part of it; line numbers are prefixed.",
    parameters: { type: "object", properties: { path: { type: "string" }, start_line: { type: "integer" }, end_line: { type: "integer" } }, required: ["path"] },
  },
  {
    type: "function",
    name: "search_code",
    description: "Search every file of the repository (vendored framework source included) for a regular expression. Returns up to 40 matching lines as path:line: text.",
    parameters: { type: "object", properties: { pattern: { type: "string" }, path_prefix: { type: "string", description: "only files under this path, for example vendor/react-dom@18.2.0/" } }, required: ["pattern"] },
  },
  {
    type: "function",
    name: "git_log",
    description: "The commit history, newest first, with the files each commit changed. Optionally only the commits that touched a path.",
    parameters: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    type: "function",
    name: "git_show",
    description: "One commit: its message and its diff (vendored files summarised).",
    parameters: { type: "object", properties: { sha: { type: "string" } }, required: ["sha"] },
  },
  {
    type: "function",
    name: "run_experiment",
    description:
      "Replay in real browsers in the sandbox under up to 6 environment variants at once. Each variant is the reporter's profile with its overrides applied; an empty overrides object is the reporter as reported. " +
      "Uses the replay plan's steps unless you give steps. Optionally a probe: a JavaScript expression evaluated in the page after the steps (it may be async), whose value is returned for every variant, " +
      "for example getComputedStyle(document.querySelector('.drawer')).transitionDuration, typeof crypto.randomUUID, or document.querySelectorAll('[data-testid=session]').length. " +
      `Takes about a minute. At most ${MAX_EXPERIMENTS} experiments in this investigation, so batch your variants.`,
    parameters: {
      type: "object",
      properties: {
        variants: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string", description: "short, for example reduced-motion or london-tz" }, overrides: overrideSchema }, required: ["name", "overrides"] },
        },
        steps: replayPlanSchema.properties.steps,
        probe: { type: "string" },
      },
      required: ["variants"],
    },
  },
  {
    type: "function",
    name: "conclude",
    description:
      "End the investigation: once an experiment (or a row of the matrix) has reproduced the bug and you understand the mechanism, or when you are sure it cannot be reproduced here. " +
      "Do not write the fix yet; it is the next step.",
    parameters: {
      type: "object",
      properties: {
        reproduced: { type: "boolean" },
        variant: { type: "string", description: "the name of the experiment variant or matrix row that reproduces the bug; 'reporter' if the reporter's own profile does" },
        overrides: overrideSchema,
        root_cause: { type: "string", description: "one sentence, at most 160 characters, without the file name" },
        file: { type: "string", description: "the file the fix belongs in" },
        explanation: { type: "string", description: "two to five sentences: the mechanism and exactly why only this group of users is affected" },
        evidence: { type: "array", items: { type: "string" }, description: "what you observed that proves it: experiment results, probe values, source lines, commits" },
        missing_details: { type: "array", items: { type: "string" }, description: "when not reproduced: what the developer could still find out from the reporter" },
      },
      required: ["reproduced", "root_cause", "evidence"],
    },
  },
  { type: "google_search" },
  { type: "url_context" },
];

const SYSTEM =
  "You are ReProducer, a senior engineer who investigates bugs that only happen to some users and that nobody on the team can reproduce. " +
  "The code usually looks correct: the cause is in how the code meets something only those users have (a browser feature or setting, an extension, " +
  "the browser translating the page, an accessibility setting, a timezone and its daylight-saving transitions, an older engine without newer APIs, a slow network) " +
  "or in how a framework or library really behaves. You prove things by experiment and measurement, never by reading alone.";

const lines = (text: string, start: number, end: number) =>
  text
    .split("\n")
    .slice(start - 1, end)
    .map((l, i) => `${start + i}: ${l}`)
    .join("\n");

/** The vendored files the failing page loads: every /vendor/... reference in the files of the app directory the replay starts in. */
async function pageDependencies(tree: RepoTree, plan: ReplayPlan): Promise<string[]> {
  const url = plan.steps.find((s) => s.action === "goto")?.url ?? "/";
  const dir = url.replace(/^\/+/, "").split(/[?#]/)[0].replace(/\/[^/]*\.[a-z]+$/, "").replace(/\/+$/, "");
  const appFiles = tree.files.filter((f) => (dir ? f.path.startsWith(`${dir}/`) : !f.path.includes("/")) || f.path.startsWith("lib/") || f.path.startsWith("static/"));
  const refs = new Set<string>();
  for (const f of appFiles) {
    if (!/\.(html|js|mjs|jsx|ts)$/.test(f.path)) continue;
    const text = await tree.read(f.path).catch(() => "");
    for (const m of text.matchAll(/\/?(vendor\/[\w@.+-]+\/[\w@.+/-]+\.m?js)/g)) refs.add(m[1]);
  }
  return [...refs].filter((p) => tree.files.some((f) => f.path === p));
}

export async function deepInvestigate(d: DeepInput): Promise<DeepResult> {
  const t0 = Date.now();
  const stats = { rounds: 0, experiments: 0, filesRead: 0, searches: 0, webSearches: 0, contextTokens: 0, minutes: 0 };
  const profiles = new Map(d.known);
  const observed = new Map<string, boolean>(d.round1.map((r) => [r.name, r.ok]));
  // The custom steps each experiment variant ran with (absent: the replay plan's steps).
  const stepsOf = new Map<string, ReplayStep[] | undefined>();
  const step = (summary: string, data?: unknown) => d.say("deep_step", summary, data);

  // 1. Everything in one context: the app, its history and the framework source the failing page loads.
  const [history, deps] = await Promise.all([gitLog(d.tree.repo, d.githubToken).catch(() => []), pageDependencies(d.tree, d.plan)]);
  const preload: { path: string; text: string }[] = [];
  let preloadChars = 0;
  for (const path of deps) {
    const text = await d.tree.read(path).catch(() => "");
    if (!text || preloadChars + text.length > MAX_PRELOAD_CHARS) continue;
    preload.push({ path, text });
    preloadChars += text.length;
  }
  const fileList = d.tree.files.map((f) => `${f.path} (${f.size} bytes)`).join("\n");
  const historyText = history.map((c) => `${c.sha} ${c.date.slice(0, 10)} ${c.message.split("\n")[0]}\n    ${c.files.slice(0, 12).join("\n    ")}`).join("\n");
  const conditions =
    "Overrides you can apply to a variant (each changes one thing about the reporter's environment): engine (chromium or webkit), locale (BCP 47), timezoneId (IANA), colorScheme, " +
    "storageBlocked (localStorage and sessionStorage throw, as in some private or in-app browsers), reducedMotion (the system asks for less motion), " +
    "translated (the browser translated the page: every text node is replaced by <font> elements, as Chrome Translate does; text inside translate=\"no\" or .notranslate is left alone), " +
    `adBlock (a content blocker: analytics, tracker and ad scripts fail to load, ad-like elements hidden), removeApis (an older browser without these APIs; choose from ${REMOVABLE_APIS.join(", ")}), ` +
    "latencyMs (every request except the page itself waits this long).";
  const first =
    `A bug report that the team cannot reproduce. Investigate it in depth.\n\n=== Bug report ===\n${d.issueText}\n\n=== What the developer knows about the reporter ===\n${d.notes || "(nothing)"}\n\n` +
    `=== How the report was understood ===\n${d.understanding.summary}\nExpected: ${d.understanding.expected}\nActual: ${d.understanding.actual}\n` +
    (d.understanding.mediaObservations ? `The reporter's recording or screenshot shows: ${d.understanding.mediaObservations}\n` : "") +
    `\n=== The reporter's environment as rebuilt ===\n${JSON.stringify(d.reporter)}\n\n=== Replay plan (steps a browser follows; the final assertions describe the correct behaviour) ===\n${JSON.stringify(d.plan)}\n\n` +
    `=== Matrix round 1: the replay under the reporter's profile, a neutral baseline, one-variable resets and a few extra conditions ===\n${formatMatrix(d.round1)}\n` +
    d.round1.map((r) => `${r.name}: ${profiles.get(r.name) ? describeProfile(profiles.get(r.name)!) : ""}`).join("\n") +
    `\n\n=== Environment conditions for experiments ===\n${conditions}\n\n=== Files in the repository ===\n${fileList}\n\n=== Git history (newest first) ===\n${historyText || "(unavailable)"}\n\n` +
    `=== The application's own source ===\n${d.code}\n\n` +
    (preload.length ? `=== Framework and library source the failing page loads (in full) ===\n${preload.map((p) => `=== ${p.path}\n${p.text}`).join("\n\n")}\n\n` : "") +
    "=== How to work ===\n" +
    "1. Write down hypotheses about what this group of users has that the team does not. Prefer causes that fit every detail of the report.\n" +
    "2. Test them with run_experiment, several variants per experiment. A variant that fails where the reporter's own profile passes points at the cause.\n" +
    "3. When something reproduces, find the mechanism: follow the code path through the application and, where the framework's or the browser's behaviour matters, through the framework source above; " +
    "check the git history for the change that introduced it; use probes to measure instead of guessing; search the web for known framework or browser behaviour when it helps.\n" +
    `4. Call conclude with the reproducing variant and the evidence. Only conclude reproduced=true if an experiment variant or a matrix row actually failed in that way. At most ${MAX_EXPERIMENTS} experiments.\n` +
    "Before each tool call, say in one or two sentences what you expect to learn from it.";

  step(
    `Opened the investigation with the application source, ${history.length} commits of history${preload.length ? ` and the full source of ${preload.map((p) => p.path.split("/").pop()).join(", ")}` : ""}`,
    { preloaded: preload.map((p) => ({ path: p.path, chars: p.text.length })), commits: history.length, chars: first.length },
  );

  let input: unknown = first;
  let previous: string | undefined;
  let nudges = 0;
  let result: Omit<DeepResult, "stats" | "interactionId"> | null = null;
  let warnedBudget = false;

  for (; stats.rounds < MAX_ROUNDS; ) {
    if (await d.shouldStop?.()) return finish({ reproduced: false, confirmed: false, evidence: [], missing: [], stoppedReason: "Stopped by you." });
    const minutes = (Date.now() - t0) / 60_000;
    stats.rounds += 1;
    // Stop exploring while there is still budget for the fix: the proposal and its retries continue this same large context.
    const budgetLeft = LIMITS.maxDeepTokens * 0.7 - d.budget.used;
    const lastCall = minutes > MAX_MINUTES || stats.rounds >= MAX_ROUNDS - 1 || budgetLeft < stats.contextTokens * 2;
    const r = await withRetry(() =>
      gemini().interactions.create({
        model: MODELS.brain,
        input: input as never,
        tools: tools as never,
        system_instruction: SYSTEM,
        generation_config: { thinking_level: "high", thinking_summaries: "auto" } as never,
        ...(previous ? { previous_interaction_id: previous } : {}),
      }),
    );
    d.budget.addUsage(r.usage as never);
    stats.contextTokens = Math.max(stats.contextTokens, (r.usage as { total_input_tokens?: number } | undefined)?.total_input_tokens ?? 0);
    if (stats.rounds === 1) step(`Context: ${Math.round(stats.contextTokens / 1000)}k tokens of Argon's 1M window`, { contextTokens: stats.contextTokens });
    previous = r.id;

    type Step = { type: string; id?: string; name?: string; arguments?: Record<string, unknown>; summary?: { text?: string }[]; content?: { type: string; text?: string }[] };
    const steps = (r.steps ?? []) as Step[];
    const thought = steps.filter((s) => s.type === "thought").flatMap((s) => s.summary ?? []).map((x) => x.text ?? "").join(" ").trim();
    if (thought) d.think("Investigating in depth", thought);
    const said = steps.filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(" ").trim();
    if (said) d.say("deep_step", said.length > 600 ? `${said.slice(0, 600)}…` : said, { tool: "note" });
    for (const s of steps.filter((x) => x.type === "google_search_call")) {
      stats.webSearches += 1;
      const queries = (s.arguments?.queries as string[] | undefined) ?? [];
      if (queries.length) step(`Searched the web: ${queries.slice(0, 3).join("; ")}`, { tool: "web", queries });
    }

    const calls = steps.filter((s) => s.type === "function_call");
    if (!calls.length) {
      if (nudges++ >= 2) break;
      input = lastCall
        ? "Time is up. Call conclude now with what you have."
        : "Continue the investigation with the tools, and call conclude when you have reproduced the bug and found the mechanism.";
      continue;
    }
    const results: unknown[] = [];
    for (const c of calls) {
      const args = c.arguments ?? {};
      let out: string;
      try {
        if (c.name === "conclude") {
          result = conclusion(args);
          out = "Concluded.";
        } else if (lastCall) {
          out = "Time is up: call conclude now with what you have.";
        } else {
          out = await runTool(c.name ?? "", args);
        }
      } catch (e) {
        out = `Error: ${(e as Error).message.slice(0, 300)}`;
      }
      results.push({ type: "function_result", name: c.name, call_id: c.id, result: [{ type: "text", text: out }] });
    }
    if (result) {
      // Acknowledge the conclusion so the chain ends on a complete turn; the fix proposal continues from here.
      const ack = await withRetry(() =>
        gemini().interactions.create({ model: MODELS.brain, input: results as never, tools: tools as never, system_instruction: SYSTEM, generation_config: { thinking_level: "low" } as never, previous_interaction_id: previous }),
      ).catch(() => null);
      if (ack) {
        d.budget.addUsage(ack.usage as never);
        previous = ack.id;
      }
      return finish(result);
    }
    if (!warnedBudget && d.budget.used + stats.contextTokens * 4 > LIMITS.maxDeepTokens * 0.7) {
      warnedBudget = true;
      const last = results[results.length - 1] as { result: { text: string }[] };
      last.result[0].text += "\n\nNote: the token budget is nearly used up. Conclude soon.";
    }
    input = results;
  }
  return finish({ reproduced: false, confirmed: false, evidence: [], missing: [], stoppedReason: "The investigation ran out of rounds without a conclusion." });

  function finish(r: Omit<DeepResult, "stats" | "interactionId">): DeepResult {
    stats.minutes = Math.round(((Date.now() - t0) / 60_000) * 10) / 10;
    d.think("Investigating in depth", null);
    return { ...r, interactionId: previous, stats };
  }

  function conclusion(a: Record<string, unknown>): Omit<DeepResult, "stats" | "interactionId"> {
    const evidence = ((a.evidence as string[]) ?? []).map(String).slice(0, 8);
    const missing = ((a.missing_details as string[]) ?? []).map(String).slice(0, 3);
    const hypothesis = { rootCause: String(a.root_cause ?? ""), file: String(a.file ?? ""), explanation: String(a.explanation ?? "") };
    if (!a.reproduced) {
      d.say("concluded", `Could not reproduce: ${hypothesis.rootCause}`, { reproduced: false, evidence, missing });
      return { reproduced: false, confirmed: false, hypothesis, evidence, missing };
    }
    const name = String(a.variant ?? "reporter");
    let focus = profiles.get(name);
    if (!focus) focus = applyOverrides(d.reporter, (a.overrides as Stressor["override"]) ?? {}, name).profile;
    // A variant found by experiment joins the matrix as an added condition, unless a matrix row already has exactly that environment.
    if (!d.known.has(focus.name)) {
      const same = (p: EnvProfile) => JSON.stringify({ ...p, name: "" }) === JSON.stringify({ ...focus!, name: "" });
      const existing = [...d.known.values()].find(same);
      focus = existing ?? { ...focus, name: `add-${slugOf(name, "found")}` };
    }
    const confirmed = observed.get(name) === false;
    // Steps an experiment wrote are adopted only if that variant failed with them: a probe-only experiment without assertions passes.
    const steps = confirmed ? stepsOf.get(name) : undefined;
    d.say("concluded", `${hypothesis.rootCause}`, { reproduced: true, variant: name, focus: describeProfile(focus), change: describeChange(d.reporter, focus), file: hypothesis.file, explanation: hypothesis.explanation, evidence, confirmed });
    return { reproduced: true, confirmed, focus, hypothesis, evidence, missing, ...(steps ? { steps } : {}) };
  }

  async function runTool(name: string, a: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "read_file": {
        const path = String(a.path ?? "").replace(/^\/+/, "");
        const text = await d.tree.read(path);
        const total = text.split("\n").length;
        stats.filesRead += 1;
        if (a.start_line || a.end_line) {
          const start = Math.max(1, Number(a.start_line ?? 1));
          const end = Math.min(total, Number(a.end_line ?? start + 200), start + 1500);
          step(`Read ${path}, lines ${start} to ${end}`, { tool: "read", path, start, end });
          return `${path} (${total} lines)\n${lines(text, start, end)}`;
        }
        step(`Read ${path} (${Math.round(text.length / 1000)}k characters)`, { tool: "read", path, chars: text.length });
        return text.length > 900_000 ? `${path} is ${text.length} characters; read it in parts with start_line and end_line.` : `${path} (${total} lines)\n${text}`;
      }
      case "search_code": {
        const prefix = String(a.path_prefix ?? "").replace(/^\/+/, "");
        let rx: RegExp;
        try {
          rx = new RegExp(String(a.pattern ?? ""), "i");
        } catch {
          rx = new RegExp(String(a.pattern ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        }
        const hits: string[] = [];
        for (const f of d.tree.files) {
          if (hits.length >= 40) break;
          if (prefix && !f.path.startsWith(prefix)) continue;
          if (!/\.(m?js|jsx|ts|tsx|css|html|json|md|vue)$/.test(f.path) || f.size > 2_000_000) continue;
          const text = await d.tree.read(f.path).catch(() => "");
          text.split("\n").forEach((l, i) => {
            if (hits.length < 40 && rx.test(l)) hits.push(`${f.path}:${i + 1}: ${l.trim().slice(0, 220)}`);
          });
        }
        stats.searches += 1;
        step(`Searched the code for /${String(a.pattern)}/${prefix ? ` in ${prefix}` : ""}: ${hits.length} matches`, { tool: "search", pattern: a.pattern, prefix, matches: hits.slice(0, 5) });
        return hits.length ? hits.join("\n") : "No matches.";
      }
      case "git_log": {
        const path = a.path ? String(a.path) : undefined;
        const log = await gitLog(d.tree.repo, d.githubToken, path);
        step(`Read the git history${path ? ` of ${path}` : ""}: ${log.length} commits`, { tool: "git", path });
        return log.map((c) => `${c.sha} ${c.date} ${c.message.trim()}\n    ${c.files.join("\n    ")}`).join("\n") || "No commits.";
      }
      case "git_show": {
        const out = await gitShow(d.tree.repo, String(a.sha ?? ""), d.githubToken);
        step(`Read commit ${String(a.sha).slice(0, 7)}: ${out.split("\n")[1]?.slice(0, 100) ?? ""}`, { tool: "git", sha: a.sha });
        return out;
      }
      case "run_experiment":
        return experiment(a);
      default:
        return `Unknown tool ${name}.`;
    }
  }

  async function experiment(a: Record<string, unknown>): Promise<string> {
    if (stats.experiments >= MAX_EXPERIMENTS) return "The experiment budget is used up. Conclude with what you have.";
    stats.experiments += 1;
    const variants = ((a.variants as { name?: string; overrides?: Stressor["override"] }[]) ?? []).slice(0, 6);
    if (!variants.length) return "Give at least one variant.";
    const used = new Set<string>();
    const built = variants.map((v, i) => {
      let name = slugOf(String(v.name ?? ""), `variant-${i + 1}`);
      while (used.has(name)) name = `${name}-${i + 1}`;
      used.add(name);
      return applyOverrides(d.reporter, v.overrides ?? {}, name).profile;
    });
    const steps = Array.isArray(a.steps) && a.steps.length ? (a.steps as ReplayStep[]) : d.plan.steps;
    const probe = typeof a.probe === "string" && a.probe.trim() ? a.probe.trim().slice(0, 600) : undefined;
    const engines = [...new Set(built.map((p) => p.engine))];
    const job: SandboxFile = {
      path: `${HARNESS_DIR}/job.json`,
      content: JSON.stringify({ baseUrl: "http://localhost:3100", plan: { steps }, profiles: built.map(withInitScripts), engines, ...(probe ? { probe } : {}) }),
    };
    const r = await d.sandbox.runWith([job], `bash ${HARNESS_DIR}/matrix.sh`, `experiment-${stats.experiments}`);
    const rows = parseMatrix(between(r.stdout, "@@RESULT@@", "@@END@@"), r).map((row) => {
      const p = built.find((b) => b.name === row.name)!;
      return { ...row, kind: "experiment", env: describeProfile(p), change: describeChange(d.reporter, p) };
    });
    for (const row of rows) {
      observed.set(row.name, row.ok);
      stepsOf.set(row.name, steps === d.plan.steps ? undefined : steps);
      profiles.set(row.name, built.find((b) => b.name === row.name)!);
    }
    const failing = rows.filter((x) => !x.ok).length;
    d.say("experiment", `Experiment ${stats.experiments}: ${rows.length} variant${rows.length === 1 ? "" : "s"}, ${failing} reproduce the bug${probe ? `, probe ${probe.slice(0, 80)}` : ""}`, { rows, probe, steps: steps === d.plan.steps ? undefined : steps });
    return rows
      .map((x) => `${x.name} [${x.change || "as reported"}]: ${x.ok ? "PASS" : `FAIL ${x.failure ?? ""}`}${x.errors?.length ? ` | errors: ${x.errors.join("; ")}` : ""}${x.pageText ? ` | page: "${x.pageText}"` : ""}${x.probe !== undefined ? ` | probe: ${x.probe}` : ""}`)
      .join("\n");
  }
}
