import { LIMITS } from "./config";
import { TokenBudget } from "./gemini";
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
}

const g = globalThis as unknown as { _warm?: WarmState };
const state = (): WarmState => (g._warm ??= { environmentId: null, busy: false, lastUsed: 0, pings: 0 });

const PING_EVERY_MS = 9 * 60_000; // under the 15-minute idle limit
const MAX_PINGS = 8; // about 72 minutes, then stop spending tokens on an unused environment

/** Take the warm environment if it is free and recently used. Returns its id (null means: start a fresh one). */
export function acquireWarm(): { environmentId: string | null; release: (id: string | null) => void } {
  const s = state();
  const fresh = s.environmentId && Date.now() - s.lastUsed < 14 * 60_000;
  if (s.busy || !fresh) {
    // A concurrent run, or a cold environment: this run starts its own and does not touch the shared one.
    return { environmentId: null, release: (id) => { if (!s.busy && id) rememberWarm(id); } };
  }
  s.busy = true;
  return { environmentId: s.environmentId, release: (id) => { s.busy = false; if (id) rememberWarm(id); } };
}

export function rememberWarm(id: string): void {
  const s = state();
  s.environmentId = id;
  s.lastUsed = Date.now();
  s.pings = 0;
  scheduleKeepAlive();
}

/** Ping the warm environment before it idles out. Enabled by KEEP_SANDBOX_WARM=true. */
function scheduleKeepAlive(): void {
  if (process.env.KEEP_SANDBOX_WARM !== "true") return;
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
