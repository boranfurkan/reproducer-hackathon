import { MODELS } from "../config";
import { TokenBudget, gemini, withRetry } from "../gemini";

// "Why this happens": once the root cause is known, Argon explains the underlying platform behaviour, cites the authoritative source and
// proves it with a few lines of code. It uses three of the model's built-in tools: Google Search grounding (sources come back as
// `url_citation` annotations), code execution (the snippet and its output come back as steps) and URL context. The step is never required:
// the investigation does not wait for it longer than a short time and ignores a failure, so it can only add to a result, never block one.

export interface Explainer {
  text: string;
  sources: { title: string; url: string }[];
  proof?: { code: string; output: string };
}

type Block = { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] };
type Step = { type: string; content?: Block[]; arguments?: { code?: string }; result?: unknown };

export async function explainRootCause(input: { rootCause: string; file: string; explanation: string; environment: string }, budget: TokenBudget): Promise<Explainer | null> {
  try {
    const r = await withRetry(() =>
      gemini().interactions.create({
        model: MODELS.brain,
        stream: false,
        generation_config: { thinking_level: "low" },
        tools: [{ type: "google_search" }, { type: "code_execution" }, { type: "url_context" }] as never,
        input:
          "A bug was traced to this root cause in a web app.\n" +
          `Root cause: ${input.rootCause}\nMechanism: ${input.explanation}\nFile: ${input.file}\nEnvironment where it happens: ${input.environment}\n\n` +
          "Explain in at most 80 words, in plain text, the underlying behaviour of the platform or language that causes it (for example a Unicode, ICU, browser or timezone rule), " +
          "and why only that environment is affected. Use Google Search to find the authoritative source (a specification, MDN or the standard) and cite it. " +
          "If the behaviour can be computed, use code execution to demonstrate it in a few lines (Python is fine) and print the result. Do not repeat the root cause sentence.",
      }),
    );
    budget.add(r.usage?.total_tokens);
    const steps = (r.steps ?? []) as Step[];
    const blocks = steps.filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).filter((c) => c.type === "text");
    const text = blocks.map((b) => b.text ?? "").join(" ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const seen = new Set<string>();
    const sources = blocks
      .flatMap((b) => b.annotations ?? [])
      .filter((a) => a.type === "url_citation" && a.url && !seen.has(a.url) && seen.add(a.url))
      .slice(0, 3)
      .map((a) => ({ title: a.title ?? new URL(a.url!).hostname, url: a.url! }));
    const call = steps.find((s) => s.type === "code_execution_call");
    const result = steps.find((s) => s.type === "code_execution_result");
    const out = result?.result == null ? "" : typeof result.result === "string" ? result.result : JSON.stringify(result.result);
    return { text: text.slice(0, 700), sources, ...(call?.arguments?.code ? { proof: { code: call.arguments.code.slice(0, 600), output: out.trim().slice(0, 300) } } : {}) };
  } catch (e) {
    console.error("explainRootCause failed:", (e as Error).message.slice(0, 200));
    return null;
  }
}
