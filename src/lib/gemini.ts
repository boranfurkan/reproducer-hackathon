import { GoogleGenAI } from "@google/genai";
import { LIMITS } from "./config";

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** The usage block of an interaction (the fields this app reads). */
export interface Usage {
  total_tokens?: number;
  total_input_tokens?: number;
  total_cached_tokens?: number;
}

/**
 * Running token total for one investigation, so the loop can stop before it gets expensive. `used` counts new tokens only: when a
 * conversation continues (previous_interaction_id), the earlier context is served from the cache and reported as cached tokens, and
 * counting it again on every turn would make a long investigation over a large context look many times bigger than it is.
 * `cached` and `peakContext` (the largest single input) are kept for the record.
 */
export class TokenBudget {
  used = 0;
  cached = 0;
  peakContext = 0;
  constructor(private readonly max: number = LIMITS.maxTokensPerRun) {}
  add(tokens: number | undefined) {
    this.used += tokens ?? 0;
    if (this.used > this.max) throw new Error(`Token budget exceeded (${this.used}/${this.max})`);
  }
  addUsage(u: Usage | undefined) {
    const cached = u?.total_cached_tokens ?? 0;
    this.cached += cached;
    this.peakContext = Math.max(this.peakContext, u?.total_input_tokens ?? 0);
    this.add(Math.max(0, (u?.total_tokens ?? 0) - cached));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thrown when the billing account is over its spending cap. Retrying cannot help, so it is never retried. */
export class SpendingCapError extends Error {
  constructor(message: string) {
    super(`Gemini API spending cap reached: ${message}`);
    this.name = "SpendingCapError";
  }
}

/** Retry 429 (rate limit) and 503 (model overloaded) with exponential backoff. A spending-cap 429 fails at once. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 1500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const message = String((e as Error).message ?? "");
      if (status === 429 && /spending cap/i.test(message)) throw new SpendingCapError(message.slice(0, 160));
      const retryable = status === 429 || status === 503;
      if (!retryable || attempt >= LIMITS.retryAttempts) throw e;
      await sleep(delay);
      delay *= 2;
    }
  }
}
