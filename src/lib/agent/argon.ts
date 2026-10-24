import { MODELS } from "../config";
import { TokenBudget, gemini, withRetry } from "../gemini";
import type { MediaRef } from "../media";

export type ThinkingLevel = "low" | "medium" | "high";

/** Ask Argon for JSON that matches `schema`. Parsing failures are retried once with the error. */
export async function askJson<T>(opts: {
  prompt: string;
  schema: object;
  budget: TokenBudget;
  system?: string;
  level?: ThinkingLevel;
  /** Recordings or screenshots Argon should look at together with the prompt. */
  media?: MediaRef[];
}): Promise<T> {
  let prompt = opts.prompt;
  for (let attempt = 1; ; attempt++) {
    const r = await withRetry(() =>
      gemini().interactions.create({
        model: MODELS.brain,
        stream: false,
        input: opts.media?.length
          ? [...opts.media.map((m) => ({ type: m.kind, uri: m.uri, mime_type: m.mimeType })), { type: "text" as const, text: prompt }]
          : prompt,
        system_instruction: opts.system,
        generation_config: { thinking_level: opts.level ?? "medium" },
        response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
      }),
    );
    opts.budget.add(r.usage?.total_tokens);
    const text = r.output_text ?? "";
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      if (attempt >= 2) throw new Error(`Argon returned invalid JSON: ${text.slice(0, 200)}`);
      prompt = `${opts.prompt}\n\nYour previous answer was not valid JSON (${(e as Error).message}). Answer again with valid JSON only.`;
    }
  }
}
