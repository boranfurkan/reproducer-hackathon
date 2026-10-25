import type { ObjectId } from "mongodb";
import { collection } from "./mongo";
import { redact } from "./redact";
import type { EnvProfile } from "./types";

// Bug memory: every verified fix is stored, so the next investigation can start from "have we seen something like this?".
//
// Atlas features used (see docs/MONGODB.md):
//   - Automated Embedding: two `autoEmbed` vector indexes, voyage-4 on the symptom text and voyage-code-4 on the diff, no embedding code
//   - Vector Search ($vectorSearch with a text `query`)
//   - Atlas Search (lexical) with token fields for facets ($searchMeta)
//   - Hybrid Search ($rankFusion over the semantic and the lexical pipeline)

export const MEMORY_VECTOR_INDEX = "bug_memory_vector";
export const MEMORY_CODE_INDEX = "bug_memory_code";
export const MEMORY_SEARCH_INDEX = "bug_memory_search";

export interface BugMemoryDoc {
  _id?: ObjectId;
  runId: ObjectId;
  repo: string;
  issueNumber: number;
  title: string;
  /** What the reporter saw, in the model's words. */
  symptom: string;
  rootCause: string;
  file: string;
  explanation: string;
  /** What isolated the bug: a variable the reporter had (locale) or one added to the profile (storage blocked). */
  isolatedVariable: string;
  environment: Pick<EnvProfile, "engine" | "locale" | "timezoneId"> & { storageBlocked: boolean; mobile: boolean };
  diff: string;
  /** What happened to the pull request: recall trusts merged fixes more and closed ones less. */
  outcome?: "open" | "merged" | "closed";
  /** The text that is embedded for semantic search. */
  memoryText: string;
  createdAt: Date;
}

export interface MemoryHit {
  id: string;
  repo: string;
  issueNumber: number;
  title: string;
  rootCause: string;
  file: string;
  isolatedVariable: string;
  environment: BugMemoryDoc["environment"];
  /** Reciprocal-rank-fusion score (after the outcome weight); only meaningful relative to the other hits. */
  score: number;
  outcome?: BugMemoryDoc["outcome"];
}

/** Merged fixes are proven in review, closed pull requests were not wanted: recall nudges its ranking accordingly. */
const OUTCOME_WEIGHT = { merged: 1.25, open: 1, closed: 0.6 } as const;

/** The three Atlas search index definitions. */
export const memoryIndexes = [
  {
    name: MEMORY_VECTOR_INDEX,
    type: "vectorSearch",
    definition: { fields: [{ type: "autoEmbed", modality: "text", path: "memoryText", model: "voyage-4" }, { type: "filter", path: "repo" }] },
  },
  {
    name: MEMORY_CODE_INDEX,
    type: "vectorSearch",
    definition: { fields: [{ type: "autoEmbed", modality: "text", path: "diff", model: "voyage-code-4" }, { type: "filter", path: "repo" }] },
  },
  {
    name: MEMORY_SEARCH_INDEX,
    type: "search",
    definition: {
      mappings: {
        dynamic: true,
        fields: {
          // token (exact value, facetable) and string (full text) on the same path
          isolatedVariable: [{ type: "token" }, { type: "string" }],
          file: [{ type: "token" }, { type: "string" }],
          environment: { type: "document", fields: { engine: { type: "token" }, locale: { type: "token" }, timezoneId: { type: "token" } } },
        },
      },
    },
  },
] as const;

/** Create the indexes that do not exist yet and wait until they can be queried. Safe to repeat. */
export async function ensureMemoryIndexes(waitMs = 8 * 60_000): Promise<Record<string, string>> {
  const col = await collection<BugMemoryDoc>("bug_memory");
  const existing = new Map((await col.listSearchIndexes().toArray()).map((i) => [i.name as string, i]));
  for (const idx of memoryIndexes) {
    if (!existing.has(idx.name)) await col.createSearchIndex({ name: idx.name, type: idx.type, definition: idx.definition });
  }
  const deadline = Date.now() + waitMs;
  for (;;) {
    const list = (await col.listSearchIndexes().toArray()) as { name: string; status?: string; queryable?: boolean }[];
    const status = Object.fromEntries(memoryIndexes.map((i) => [i.name, String(list.find((x) => x.name === i.name)?.status ?? "MISSING")]));
    const ready = memoryIndexes.every((i) => list.find((x) => x.name === i.name)?.queryable);
    if (ready || Date.now() > deadline) return status;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export function memoryText(m: Pick<BugMemoryDoc, "title" | "symptom" | "rootCause" | "isolatedVariable" | "environment">): string {
  const e = m.environment;
  return `${m.title}. ${m.symptom} Cause: ${m.rootCause} Only affects visitors with: ${m.isolatedVariable}. Environment: ${e.engine}, ${e.locale}, ${e.timezoneId}${e.storageBlocked ? ", storage blocked" : ""}${e.mobile ? ", mobile" : ""}.`;
}

/** Store a verified fix (the latest one per issue). Secrets are redacted; the code and the explanation are kept. */
export async function recordMemory(m: Omit<BugMemoryDoc, "memoryText" | "createdAt">): Promise<void> {
  const clean = { ...m, symptom: redact(m.symptom), rootCause: redact(m.rootCause), explanation: redact(m.explanation), diff: redact(m.diff) };
  const col = await collection<BugMemoryDoc>("bug_memory");
  // One entry per issue: investigating the same issue again replaces the earlier entry instead of adding a duplicate that would crowd out other hits.
  await col.replaceOne({ repo: clean.repo, issueNumber: clean.issueNumber }, { ...clean, memoryText: memoryText(clean), createdAt: new Date() }, { upsert: true });
}

/**
 * "Seen something like this?": semantic search (Automated Embedding) and lexical search fused with $rankFusion.
 * Returns an empty list if the indexes are not ready or the query fails: memory is a hint, never a requirement.
 */
export async function recallSimilar(queryText: string, limit = 3, minSemantic = 0): Promise<MemoryHit[]> {
  try {
    const col = await collection<BugMemoryDoc>("bug_memory");
    // A fused rank only orders results; with a small memory it always returns something. When asked, keep only hits whose semantic
    // similarity on its own clears a threshold (see similarBySymptom), so an unrelated bug is not presented as "seen before".
    const related = minSemantic
      ? new Set((await similarBySymptom(queryText, 10, minSemantic)).map((h) => h.id))
      : null;
    const docs = await col
      .aggregate([
        {
          $rankFusion: {
            input: {
              pipelines: {
                semantic: [{ $vectorSearch: { index: MEMORY_VECTOR_INDEX, path: "memoryText", query: queryText, numCandidates: 50, limit: 10 } }],
                lexical: [
                  { $search: { index: MEMORY_SEARCH_INDEX, text: { query: queryText, path: ["title", "symptom", "rootCause", "isolatedVariable", "memoryText"] } } },
                  { $limit: 10 },
                ],
              },
            },
            combination: { weights: { semantic: 0.7, lexical: 0.3 } },
            scoreDetails: true,
          },
        },
        { $addFields: { score: { $meta: "scoreDetails" } } },
        { $limit: limit * 2 },
      ])
      .toArray();
    return docs
      .map((d) => ({
      id: String(d._id),
      repo: d.repo,
      issueNumber: d.issueNumber,
      title: d.title,
      rootCause: d.rootCause,
      file: d.file,
      isolatedVariable: d.isolatedVariable,
      environment: d.environment,
      score: Number(d.score?.value ?? 0) * OUTCOME_WEIGHT[(d.outcome as keyof typeof OUTCOME_WEIGHT) ?? "open"],
      outcome: d.outcome,
    }))
      .filter((h) => !related || related.has(h.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (e) {
    console.error("recallSimilar failed:", (e as Error).message);
    return [];
  }
}

/**
 * Past fixes that really look like a description: the semantic (voyage-4) cosine score, which unlike a fused rank is meaningful on its own.
 * Measured on the demo memory: related bugs 0.78 to 0.85, unrelated ones 0.62 to 0.72, so 0.76 separates them.
 */
export async function similarBySymptom(text: string, limit = 3, minScore = 0.76): Promise<(MemoryHit & { similarity: number })[]> {
  try {
    const col = await collection<BugMemoryDoc>("bug_memory");
    const docs = await col
      .aggregate([{ $vectorSearch: { index: MEMORY_VECTOR_INDEX, path: "memoryText", query: text, numCandidates: 50, limit: limit + 1 } }, { $addFields: { similarity: { $meta: "vectorSearchScore" } } }])
      .toArray();
    return docs
      .filter((d) => d.similarity >= minScore)
      .slice(0, limit + 1)
      .map((d) => ({ id: String(d._id), repo: d.repo, issueNumber: d.issueNumber, title: d.title, rootCause: d.rootCause, file: d.file, isolatedVariable: d.isolatedVariable, environment: d.environment, score: d.similarity, similarity: d.similarity, outcome: d.outcome }));
  } catch (e) {
    console.error("similarBySymptom failed:", (e as Error).message);
    return [];
  }
}

/**
 * Past fixes whose diff looks like this one (voyage-code-4 embeddings). Measured on the demo memory: unrelated fixes score 0.74 to 0.80,
 * the same fix 0.94 to 0.98, so only scores from 0.85 count as similar.
 */
export async function similarFixes(diff: string, limit = 3, excludeRunId?: string, minScore = 0.85): Promise<{ id: string; repo: string; issueNumber: number; title: string; file: string; isolatedVariable: string; outcome?: string }[]> {
  try {
    const col = await collection<BugMemoryDoc>("bug_memory");
    const docs = await col
      .aggregate([{ $vectorSearch: { index: MEMORY_CODE_INDEX, path: "diff", query: diff.slice(0, 6000), numCandidates: 50, limit: limit + 1 } }, { $project: { repo: 1, issueNumber: 1, title: 1, file: 1, runId: 1, isolatedVariable: 1, outcome: 1, score: { $meta: "vectorSearchScore" } } }])
      .toArray();
    return docs
      .filter((d) => (!excludeRunId || String(d.runId) !== excludeRunId) && d.score >= minScore)
      .slice(0, limit)
      
      .map((d) => ({ id: String(d._id), repo: d.repo, issueNumber: d.issueNumber, title: d.title, file: d.file, isolatedVariable: String(d.isolatedVariable ?? ""), outcome: d.outcome }));
  } catch (e) {
    console.error("similarFixes failed:", (e as Error).message);
    return [];
  }
}

export interface FacetBucket {
  value: string;
  count: number;
}

/** What the memory has learned, grouped by the variable that isolated each bug, the engine and the locale (Atlas Search facets). */
export async function memoryFacets(): Promise<{ total: number; variable: FacetBucket[]; engine: FacetBucket[]; locale: FacetBucket[] }> {
  const empty = { total: 0, variable: [], engine: [], locale: [] };
  try {
    const col = await collection<BugMemoryDoc>("bug_memory");
    const [meta] = await col
      .aggregate([
        {
          $searchMeta: {
            index: MEMORY_SEARCH_INDEX,
            facet: {
              operator: { exists: { path: "isolatedVariable" } },
              facets: {
                variable: { type: "string", path: "isolatedVariable", numBuckets: 8 },
                engine: { type: "string", path: "environment.engine", numBuckets: 5 },
                locale: { type: "string", path: "environment.locale", numBuckets: 8 },
              },
            },
          },
        },
      ])
      .toArray();
    if (!meta) return empty;
    const buckets = (k: string): FacetBucket[] => (meta.facet?.[k]?.buckets ?? []).map((b: { _id: string; count: number }) => ({ value: b._id, count: b.count }));
    return { total: Number(meta.count?.lowerBound ?? 0), variable: buckets("variable"), engine: buckets("engine"), locale: buckets("locale") };
  } catch (e) {
    console.error("memoryFacets failed:", (e as Error).message);
    return empty;
  }
}
