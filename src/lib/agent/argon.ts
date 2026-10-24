import { MODELS } from "../config";
import { TokenBudget, gemini, withRetry } from "../gemini";
import type { MediaRef } from "../media";

/**
 * One streamed Interactions call (docs: streaming, thinking). Events: `step.delta` carries `thought_summary` (the reasoning so far, in
 * pieces) and `text` (the answer, in pieces); `interaction.completed` carries the final usage.
 */
async function streamText(request: Parameters<ReturnType<typeof gemini>["interactions"]["create"]>[0], onThought: (summary: string) => void): Promise<{ text: string; tokens: number }> {
  const stream = (await gemini().interactions.create({ ...request, stream: true } as never)) as unknown as AsyncIterable<{
    event_type: string;
    delta?: { type: string; text?: string; content?: { text?: string } };
    interaction?: { usage?: { total_tokens?: number } };
  }>;
  let text = "";
  let thought = "";
  let tokens = 0;
  for await (const event of stream) {
    if (event.event_type === "step.delta" && event.delta) {
      if (event.delta.type === "thought_summary") {
        thought += event.delta.content?.text ?? "";
        onThought(thought);
      } else if (event.delta.type === "text") {
        text += event.delta.text ?? "";
      }
    } else if (event.event_type === "interaction.completed") {
      tokens = event.interaction?.usage?.total_tokens ?? 0;
    }
  }
  return { text, tokens };
}

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
  /** When set, the call streams and this receives Argon's thought summary as it grows (the live "thinking" line of the run page). */
  onThought?: (summary: string) => void;
}): Promise<T> {
  let prompt = opts.prompt;
  for (let attempt = 1; ; attempt++) {
    const request = {
      model: MODELS.brain,
      input: opts.media?.length
        ? [...opts.media.map((m) => ({ type: m.kind, uri: m.uri, mime_type: m.mimeType })), { type: "text" as const, text: prompt }]
        : prompt,
      system_instruction: opts.system,
      generation_config: { thinking_level: opts.level ?? "medium", ...(opts.onThought ? { thinking_summaries: "auto" as const } : {}) },
      response_format: { type: "text" as const, mime_type: "application/json", schema: opts.schema },
    };
    let text: string;
    if (opts.onThought) {
      const r = await withRetry(() => streamText(request, opts.onThought!));
      opts.budget.add(r.tokens);
      text = r.text;
    } else {
      const r = await withRetry(() => gemini().interactions.create({ ...request, stream: false }));
      opts.budget.add(r.usage?.total_tokens);
      text = r.output_text ?? "";
    }
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      if (attempt >= 2) throw new Error(`Argon returned invalid JSON: ${text.slice(0, 200)}`);
      prompt = `${opts.prompt}\n\nYour previous answer was not valid JSON (${(e as Error).message}). Answer again with valid JSON only.`;
    }
  }
}
