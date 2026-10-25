import { investigate, type Ticket } from "./agent/investigate";
import { startRun, type RunDoc } from "./events";
import { collection } from "./mongo";
import { getIssue } from "./github";
import type { MediaRef } from "./media";
import { acquireWarm } from "./warm";

export interface StartInvestigationInput {
  token: string;
  login: string;
  owner: string;
  name: string;
  issueNumber: number;
  notes: string;
  /** Variables the app under investigation needs. Sandbox only: redacted everywhere, never stored. */
  envVars?: Record<string, string>;
  /** Screen recording or screenshots already uploaded through /api/uploads. */
  media?: MediaRef[];
  /** Deep investigation (tools, experiments, framework source; up to about half an hour) instead of the quick matrix-and-fix. */
  deep?: boolean;
}

/**
 * Create the run, then investigate in the background of this long-running server process. Returns the run id at once.
 * (This must not run in a serverless function: an investigation takes minutes.)
 */
export async function startInvestigation(input: StartInvestigationInput): Promise<string> {
  const issue = await getIssue(input.token, input.owner, input.name, input.issueNumber);
  const ticket: Ticket = {
    repo: { owner: input.owner, name: input.name },
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body,
    notes: input.notes,
    media: input.media,
  };
  const secrets = Object.values(input.envVars ?? {});
  const record = await startRun(ticket, secrets, { userLogin: input.login, issueUrl: issue.url, mode: input.deep ? "deep" : "quick" });
  // Env vars are fixed when a sandbox environment is created (later values are ignored) and would linger in a reused one.
  // So a run with env vars gets its own fresh environment, which is never remembered for reuse. Slower (cold install), but correct and private.
  const hasEnvVars = secrets.length > 0;
  const warm = hasEnvVars ? { environmentId: null, release: () => undefined } : await acquireWarm();

  void (async () => {
    let environmentId: string | null = warm.environmentId;
    try {
      const result = await investigate(ticket, record.emit, {
        environmentId: warm.environmentId,
        githubToken: input.token,
        envVars: input.envVars,
        onThinking: record.think,
        deep: input.deep,
        trail: record.trail,
        // The Stop button sets a flag on the run; the investigation checks it between steps.
        shouldStop: async () => Boolean((await (await collection<RunDoc>("runs")).findOne({ _id: record.runId }, { projection: { stopRequested: 1 } }))?.stopRequested),
      });
      environmentId = result.environmentId;
      await record.finish(result);
    } catch (e) {
      await record.fail(e);
    } finally {
      warm.release(environmentId);
    }
  })();

  return record.runId.toString();
}
