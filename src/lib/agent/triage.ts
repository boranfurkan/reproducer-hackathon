import { MODELS } from "../config";
import { gemini, withRetry } from "../gemini";
import { similarBySymptom } from "../memory";
import type { IssueSummary } from "../github";

// Triage of a repository's open issues, so the list says which ones are worth an investigation before anybody starts one:
//   - one Flash call reads all the titles and descriptions and flags the ones that look specific to a user's environment
//     (device, browser, language, timezone, storage) rather than plain logic bugs
//   - an Atlas hybrid search per issue finds a verified fix in memory that looks like it
// Cached for ten minutes per repository, so opening the list again costs nothing.

export interface Triage {
  number: number;
  /** The issue reads like a bug that only some users hit because of their environment. */
  environmentSpecific: boolean;
  /** One short phrase on why, from the model. */
  hint: string;
  /** A verified fix in memory that looks like this issue. */
  similar?: { title: string; issue: string; outcome?: string };
}

const cache = new Map<string, { at: number; value: Triage[] }>();

const inflight = new Map<string, Promise<Triage[]>>();

/** Concurrent requests for the same repository share one triage (the page can ask twice while the first answer is on its way). */
export function triageIssues(repo: string, issues: IssueSummary[]): Promise<Triage[]> {
  const running = inflight.get(repo);
  if (running) return running;
  const p = triageNow(repo, issues).finally(() => inflight.delete(repo));
  inflight.set(repo, p);
  return p;
}

async function triageNow(repo: string, issues: IssueSummary[]): Promise<Triage[]> {
  const hit = cache.get(repo);
  if (hit && Date.now() - hit.at < 10 * 60_000 && hit.value.length >= Math.min(issues.length, 12)) return hit.value;
  const list = issues.slice(0, 12);
  if (!list.length) return [];

  let flags = new Map<number, { env: boolean; hint: string }>();
  try {
    const r = await withRetry(() =>
      gemini().interactions.create({
        model: MODELS.summary,
        stream: false,
        input:
          "For each GitHub issue, say whether it reads like a bug that only some users hit because of their environment (device, browser, language or locale, timezone, storage or privacy settings, in-app browsers) rather than a plain logic bug that everyone would hit. " +
          "hint: at most 8 words on why.\n\n" +
          list.map((i) => `#${i.number} ${i.title}\n${i.body.slice(0, 500)}`).join("\n---\n"),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: { issues: { type: "array", items: { type: "object", properties: { number: { type: "number" }, environmentSpecific: { type: "boolean" }, hint: { type: "string" } }, required: ["number", "environmentSpecific", "hint"] } } },
            required: ["issues"],
          },
        },
      }),
    );
    const parsed = JSON.parse(r.output_text ?? "{}") as { issues?: { number: number; environmentSpecific: boolean; hint: string }[] };
    flags = new Map((parsed.issues ?? []).map((x) => [x.number, { env: x.environmentSpecific, hint: x.hint }]));
  } catch (e) {
    console.error("triage model call failed:", (e as Error).message);
  }

  const out = await Promise.all(
    list.map(async (i): Promise<Triage> => {
      // The issue's own earlier run is not "similar": the first hit that is a different issue is.
      const hits = await similarBySymptom(`${i.title}. ${i.body.slice(0, 400)}`, 3);
      const match = hits.find((h) => `${h.repo}#${h.issueNumber}` !== `${repo}#${i.number}`);
      const f = flags.get(i.number);
      const similar = match ? { title: match.title, issue: `${match.repo.split("/")[1]}#${match.issueNumber}`, outcome: match.outcome } : undefined;
      return { number: i.number, environmentSpecific: f?.env ?? false, hint: f?.hint ?? "", similar };
    }),
  );
  cache.set(repo, { at: Date.now(), value: out });
  return out;
}
