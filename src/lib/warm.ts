import { LIMITS } from "./config";
import { TokenBudget } from "./gemini";
import { HARNESS_DIR, harnessFiles } from "./harness/scripts";
import { AntigravitySandbox } from "./sandbox/antigravity";

// Sandbox environments lose /opt (Playwright, the repo clone) after 15 idle minutes, and a cold install takes about 2 minutes.
// This keeps one environment warm between investigations and, optionally, pings it while the server is running.
// Only one investigation may use the warm environment at a time (they share /opt/target); others get a fresh one.

interface WarmState {
  environmentId: string | null;
  busy: boolean;
  lastUsed: number;
  pings: number;
  timer?: NodeJS.Timeout;
  /** A warm-up in progress (installing Playwright, cloning the repository). */
  warming?: Promise<void>;
}

const g = globalThis as unknown as { _warm?: WarmState };
const state = (): WarmState => (g._warm ??= { environmentId: null, busy: false, lastUsed: 0, pings: 0 });

const PING_EVERY_MS = 9 * 60_000; // under the 15-minute idle limit
const MAX_PINGS = 8; // about 72 minutes, then stop spending tokens on an unused environment

/**
 * Take the warm environment if it is free and recently used. Returns its id (null means: start a fresh one).
 * If a warm-up is in progress it is awaited first (up to 4 minutes), so the run does not start a second cold sandbox.
 */
export async function acquireWarm(): Promise<{ environmentId: string | null; release: (id: string | null) => void }> {
  const s = state();
  if (s.warming) await Promise.race([s.warming, new Promise((r) => setTimeout(r, 4 * 60_000))]);
  const fresh = s.environmentId && Date.now() - s.lastUsed < 14 * 60_000;
  if (s.busy || !fresh) {
    // A concurrent run, or a cold environment: this run starts its own and does not touch the shared one.
    return { environmentId: null, release: (id) => { if (!s.busy && id) rememberWarm(id); } };
  }
  s.busy = true;
  return { environmentId: s.environmentId, release: (id) => { s.busy = false; if (id) rememberWarm(id); } };
}

/** What the ticket form shows: ready, being prepared, or cold (the first investigation will install Playwright, about 2 minutes). */
export function warmState(): "warm" | "warming" | "cold" {
  const s = state();
  if (s.warming) return "warming";
  return s.environmentId && Date.now() - s.lastUsed < 14 * 60_000 ? "warm" : "cold";
}

/**
 * Get a sandbox ready in the background (Playwright installed, repository cloned) while the developer fills in the ticket form.
 * Returns what happened: already warm, already warming, or a warm-up started now. Never throws.
 */
export function warmUp(repoUrl: string): "warm" | "warming" | "started" {
  const s = state();
  if (s.warming) return "warming";
  if (s.busy) return "warm";
  if (s.environmentId && Date.now() - s.lastUsed < 12 * 60_000) return "warm";
  s.warming = (async () => {
    try {
      const sandbox = new AntigravitySandbox(new TokenBudget(LIMITS.maxTokensPerRun), null);
      const r = await sandbox.runWith(harnessFiles(), `bash ${HARNESS_DIR}/boot.sh ${repoUrl}`, "warm-up");
      if (r.stdout.includes("BOOT_OK") && sandbox.environmentId) rememberWarm(sandbox.environmentId);
    } catch (e) {
      console.error("warm-up failed:", (e as Error).message);
    } finally {
      s.warming = undefined;
    }
  })();
  return "started";
}

export function rememberWarm(id: string): void {
  const s = state();
  s.environmentId = id;
  s.lastUsed = Date.now();
  s.pings = 0;
  scheduleKeepAlive();
}

/** Ping the warm environment before it idles out (about 9 minutes apart, at most 8 times: roughly 12k tokens each). On by default; KEEP_SANDBOX_WARM=false turns it off. */
function scheduleKeepAlive(): void {
  if (process.env.KEEP_SANDBOX_WARM === "false") return;
  const s = state();
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(async () => {
    if (s.busy || !s.environmentId || s.pings >= MAX_PINGS) return;
    try {
      await new AntigravitySandbox(new TokenBudget(LIMITS.maxTokensPerRun), s.environmentId).run("true", "keepalive");
      s.pings += 1;
      s.lastUsed = Date.now();
    } catch (e) {
      console.error("keep-alive failed:", (e as Error).message);
      return;
    }
    scheduleKeepAlive();
  }, PING_EVERY_MS);
  s.timer.unref?.();
}
