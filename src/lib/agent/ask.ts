import { MODELS } from "../config";
import type { RunDoc } from "../events";
import { TokenBudget, gemini, withRetry } from "../gemini";
import { type BugMemoryDoc, recallSimilar } from "../memory";
import { collection } from "../mongo";

// "Ask the memory": a question in plain words, answered by the model calling functions that read MongoDB (function calling, docs: function-calling).
// The functions are read-only. The answer cites the runs it used, and the calls are returned so the page can show what was looked at.

const tools = [
  {
    type: "function",
    name: "search_memory",
    description: "Hybrid search (semantic and lexical, Atlas) over verified past bug fixes. Use it to find bugs that look like a description. Merged fixes rank above closed ones.",
    parameters: { type: "object", properties: { query: { type: "string", description: "What to look for, in plain words" }, limit: { type: "number", description: "How many results, 1 to 8" } }, required: ["query"] },
  },
  {
    type: "function",
    name: "memory_counts",
    description: "Counts of verified fixes grouped by one field: what isolated the bug (locale, timezone, storage, device), the browser engine, the locale, or what happened to the pull request.",
    parameters: { type: "object", properties: { group_by: { type: "string", enum: ["isolatedVariable", "engine", "locale", "outcome", "file"] } }, required: ["group_by"] },
  },
  {
    type: "function",
    name: "list_my_runs",
    description: "The signed-in user's recent investigations with status, pull request state and what isolated the bug.",
    parameters: { type: "object", properties: { status: { type: "string", enum: ["running", "fixed", "not_reproduced", "no_fix", "stopped", "failed"] }, limit: { type: "number" } } },
  },
];

export interface AskResult {
  answer: string;
  /** What the model looked at, in order, for the page ("searched memory for ..."). */
  calls: { tool: string; args: Record<string, unknown>; found: number }[];
  tokens: number;
}

async function runTool(name: string, args: Record<string, unknown>, login: string): Promise<unknown> {
  if (name === "search_memory") {
    const hits = await recallSimilar(String(args.query ?? ""), Math.min(8, Math.max(1, Number(args.limit ?? 5))));
    return hits.map((h) => ({ run: `${h.repo.split("/")[1]}#${h.issueNumber}`, title: h.title, rootCause: h.rootCause, file: h.file, isolatedBy: h.isolatedVariable, environment: h.environment, pullRequest: h.outcome ?? "open" }));
  }
  if (name === "memory_counts") {
    const field = String(args.group_by);
    const path = { isolatedVariable: "$isolatedVariable", engine: "$environment.engine", locale: "$environment.locale", outcome: { $ifNull: ["$outcome", "open"] }, file: "$file" }[field];
    if (!path) return { error: "unknown group_by" };
    const col = await collection<BugMemoryDoc>("bug_memory");
    const rows = await col.aggregate([{ $group: { _id: path, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 12 }]).toArray();
    return rows.map((r) => ({ value: r._id, count: r.count }));
  }
  if (name === "list_my_runs") {
    const runs = await collection<RunDoc>("runs");
    const status = typeof args.status === "string" ? { status: args.status as RunDoc["status"] } : {};
    const docs = await runs.find({ userLogin: login, ...status }, { projection: { repo: 1, issueNumber: 1, title: 1, status: 1, prState: 1, decisiveVariables: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(Math.min(15, Math.max(1, Number(args.limit ?? 8)))).toArray();
    return docs.map((d) => ({ run: `${d.repo.split("/")[1]}#${d.issueNumber}`, title: d.title, status: d.status, pullRequest: d.prState, isolatedBy: d.decisiveVariables?.[0], at: d.createdAt }));
  }
  return { error: `unknown function ${name}` };
}

const SYSTEM =
  "You answer questions about ReProducer's memory of verified bug fixes and about the user's investigations. Always call the functions to get facts: never guess. " +
  "Answer in two to five short sentences, plain text. Name the runs you used like repo#number. If the memory has nothing relevant, say so.";

export async function askMemory(question: string, login: string): Promise<AskResult> {
  const budget = new TokenBudget(60_000);
  const calls: AskResult["calls"] = [];
  type Step = { type: string; id?: string; name?: string; arguments?: Record<string, unknown> };
  let input: unknown = question;
  let previous: string | undefined;
  for (let round = 0; round < 5; round++) {
    const r = await withRetry(() =>
      gemini().interactions.create({
        model: MODELS.summary,
        stream: false,
        input: input as never,
        tools: tools as never,
        system_instruction: SYSTEM,
        ...(previous ? { previous_interaction_id: previous } : {}),
      }),
    );
    budget.add(r.usage?.total_tokens);
    const fcs = ((r.steps ?? []) as Step[]).filter((s) => s.type === "function_call");
    if (!fcs.length) return { answer: (r.output_text ?? "").trim() || "I could not find an answer.", calls, tokens: budget.used };
    const results = [];
    for (const fc of fcs) {
      const result = await runTool(fc.name ?? "", fc.arguments ?? {}, login).catch((e) => ({ error: (e as Error).message }));
      calls.push({ tool: fc.name ?? "", args: fc.arguments ?? {}, found: Array.isArray(result) ? result.length : 0 });
      results.push({ type: "function_result", name: fc.name, call_id: fc.id, result: [{ type: "text", text: JSON.stringify(result) }] });
    }
    input = results;
    previous = r.id;
  }
  return { answer: "I looked several times but could not settle on an answer. Try a more specific question.", calls, tokens: budget.used };
}
