import { MODELS } from "../config";
import type { RunDoc } from "../events";
import { gemini, withRetry } from "../gemini";

/**
 * When a bug could not be reproduced, the developer still has to answer the reporter. This drafts that comment on the issue: friendly, short,
 * asks only for the details that would help (the ones the investigation already worked out) and says what was tried. The developer edits it
 * and posts it with one click; nothing is posted before.
 */
export async function draftReporterReply(run: Pick<RunDoc, "title" | "notes" | "profile" | "suggestions" | "matrix" | "reason" | "repo" | "issueNumber">): Promise<string> {
  const tried = (run.matrix ?? []).map((m) => m.name.replace(/^add-/, "reporter plus ")).slice(0, 8).join(", ");
  const fallback =
    `Thanks for the report. I tried to reproduce this with ${run.profile ? `${run.profile.engine}, locale ${run.profile.locale}, timezone ${run.profile.timezoneId}` : "the details I had"}, but it worked fine for me.\n\n` +
    `Could you tell me a bit more?\n${(run.suggestions ?? []).map((s) => `- ${s}`).join("\n")}`;
  try {
    const r = await withRetry(() =>
      gemini().interactions.create({
        model: MODELS.summary,
        stream: false,
        input:
          "Write a short, friendly comment for a GitHub issue, from a maintainer to the person who reported a bug that could not be reproduced. " +
          "Thank them, say briefly what was tried (the environment and the variations), say it worked in all of them, and ask ONLY for the specific details listed. " +
          "Plain text, at most 110 words, no headings, no promises, no emojis. A short bullet list for the questions is fine.\n\n" +
          `Issue: ${run.title}\nWhat the maintainer knew about the reporter: ${run.notes || "(nothing)"}\nEnvironment tried: ${JSON.stringify(run.profile)}\nVariations tried: ${tried}\n` +
          `Details that would help:\n${(run.suggestions ?? []).map((s) => `- ${s}`).join("\n") || "- the exact steps, device, browser and language"}`,
      }),
    );
    return (r.output_text ?? "").trim() || fallback;
  } catch {
    return fallback;
  }
}
