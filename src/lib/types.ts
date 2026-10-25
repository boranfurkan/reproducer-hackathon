// Shared types for the investigation loop.

export type Engine = "chromium" | "webkit" | "firefox";

/** The reporter's environment, as reconstructed by the model. */
export interface EnvProfile {
  name: string;
  engine: Engine;
  locale: string;
  timezoneId: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
  colorScheme?: "light" | "dark";
  storageBlocked?: boolean;
  reducedMotion?: boolean;
  /** The page was translated by the browser (Chrome Translate and the like): text nodes are replaced by <font> elements. */
  translated?: boolean;
  /** A content blocker is on: trackers and ad scripts are blocked, ad-like elements hidden. */
  adBlock?: boolean;
  /** APIs this (older) browser does not have, for example crypto.randomUUID on iOS 14. See harness/conditions.ts. */
  removeApis?: string[];
  /** A slow connection: every request that is not the page itself waits this many milliseconds. */
  latencyMs?: number;
  /** What we could not emulate (GPU, OEM keyboard, real hinge...). Shown in the fidelity report. */
  notEmulated: string[];
}

export interface SandboxFile {
  /** Absolute path inside the sandbox. Must be under /opt or /workspace. */
  path: string;
  content: string;
}

/** One sandbox call, for finding where the time goes. */
export interface CallTiming {
  /** The start of the sandbox environment id the call ran in. */
  env?: string;
  label: string;
  ms: number;
  tokens: number;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Everything the orchestrator needs from a sandbox. Antigravity first, Docker as fallback. */
export interface Sandbox {
  /** Environment id for reuse across calls (null until first use). */
  readonly environmentId: string | null;
  run(cmd: string, label?: string, files?: SandboxFile[]): Promise<ExecResult>;
  /** Deliver files (as inline sources) and run a command in ONE sandbox call. */
  runWith(files: SandboxFile[], cmd: string, label?: string): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  destroy(): Promise<void>;
}

export type RunEventType =
  | "understood"
  | "profile"
  | "boot"
  | "hypothesis"
  | "memory"
  | "matrix"
  | "root_cause"
  | "explained"
  | "test_written"
  | "fix_attempt"
  | "green"
  | "approval_requested"
  | "pr_opened"
  | "pr_update"
  | "revision"
  | "deep_step"
  | "experiment"
  | "concluded"
  | "notes"
  | "stopped";

export interface RunEvent {
  runId: string;
  at: Date;
  type: RunEventType;
  summary: string;
  data?: unknown;
}
