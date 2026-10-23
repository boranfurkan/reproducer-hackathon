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

/** Running token total for one investigation, so the loop can stop before it gets expensive. */
export class TokenBudget {
  used = 0;
  constructor(private readonly max: number = LIMITS.maxTokensPerRun) {}
  add(tokens: number | undefined) {
    this.used += tokens ?? 0;
    if (this.used > this.max) throw new Error(`Token budget exceeded (${this.used}/${this.max})`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry 429/503 (model overloaded) with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 1500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const retryable = status === 429 || status === 503;
      if (!retryable || attempt >= LIMITS.retryAttempts) throw e;
      await sleep(delay);
      delay *= 2;
    }
  }
}
