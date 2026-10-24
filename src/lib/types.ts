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
  | "test_written"
  | "fix_attempt"
  | "green"
  | "approval_requested"
  | "pr_opened"
  | "stopped";

export interface RunEvent {
  runId: string;
  at: Date;
  type: RunEventType;
  summary: string;
  data?: unknown;
}
