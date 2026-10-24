import { MODELS } from "../config";
import type { RunDoc } from "../events";
import { gemini, withRetry } from "../gemini";

/** One plain line: the model's short title, or a tidied start of the root cause as a fallback. Never contains backticks, newlines or file paths. */
export function pullRequestTitle(run: Pick<RunDoc, "prTitle" | "rootCause" | "title">): string {
  const raw = run.prTitle?.trim() || run.rootCause?.rootCause || run.title;
  const clean = raw.replace(/`/g, "").replace(/\s+/g, " ").trim();
  const cut = clean.length > 70 ? `${clean.slice(0, 70).replace(/\s+\S*$/, "")}…` : clean;
  return /^fix\b/i.test(cut) ? cut : `Fix: ${cut}`;
}

/** Two or three plain sentences for the top of the PR. Falls back to the root cause if the model is unavailable. */
async function summarize(run: RunDoc): Promise<string> {
  const fallback = run.rootCause ? `${run.rootCause.rootCause}` : run.understandingSummary ?? "";
  try {
    const r = await withRetry(() =>
      gemini().interactions.create({
        model: MODELS.summary,
        stream: false,
        input:
          "Write 2 or 3 plain sentences for the top of a pull request description. Say what was wrong, who was affected, and what the change does. " +
          "No headings, no marketing words.\n\n" +
          `Root cause: ${run.rootCause?.rootCause}\n${run.rootCause?.explanation}\nIssue: ${run.title}\nReporter environment: ${JSON.stringify(run.profile)}\nDiff:\n${run.diff?.slice(0, 4000)}`,
      }),
    );
    return (r.output_text ?? "").trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function buildPrBody(run: RunDoc, issueNumber: number, summary?: string): Promise<string> {
  // Rows that failed for a different reason (another bug in the repository) are marked so the table does not contradict the text.
  const other = new Set((run.otherProblems ?? []).map((o) => o.profile));
  const matrix = (run.matrix ?? []).map((m) => `| ${m.name} | ${m.ok ? "passes" : other.has(m.name) ? "fails: a different bug, not part of this change" : "fails"} |`).join("\n");
  const p = run.profile;
  const env = p ? `${p.engine}, locale ${p.locale}, timezone ${p.timezoneId}, ${p.viewport.width}x${p.viewport.height}${p.hasTouch ? ", touch" : ""}${p.storageBlocked ? ", storage blocked" : ""}` : "unknown";
  return [
    `Fixes #${issueNumber}`,
    "",
    summary ?? (await summarize(run)),
    "",
    "## Root cause",
    `In \`${run.rootCause?.file}\`: ${(run.rootCause?.rootCause ?? "").replace(new RegExp(`^\\W*${(run.rootCause?.file ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\W*:?\\s*`), "")}`,
    "",
    run.rootCause?.explanation ?? "",
    "",
    "## How it was reproduced",
    `Reporter environment as reconstructed from the issue: ${env}.`,
    run.decisiveVariables?.length ? `The bug disappears or appears with: ${run.decisiveVariables.join(", ")}.` : "",
    "",
    "## Verification (after the fix)",
    "A Playwright test (`tests/repro.spec.js`) failed on the reporter's environment before the change and passes after it. The existing tests pass, and the same replay passes in every environment that belongs to this issue:",
    "",
    "| Environment | Replay |",
    "|---|---|",
    matrix,
    "",
    p?.notEmulated?.length ? `Not emulated: ${p.notEmulated.join("; ")}.` : "",
    "",
    run.otherProblems?.length
      ? `## Not part of this change\nWhile investigating, other environments failed for a different reason. They are probably separate bugs and were left alone:\n${run.otherProblems.map((o) => `- ${o.profile}: ${o.problem}`).join("\n")}`
      : "",
    "",
    "Opened by ReProducer after a developer approved the change.",
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");
}
