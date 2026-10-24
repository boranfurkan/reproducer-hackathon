import { createHash } from "node:crypto";
import { MODELS, SANDBOX_NETWORK } from "../config";
import { TokenBudget, gemini, withRetry } from "../gemini";
import type { CallTiming, ExecResult, Sandbox, SandboxFile } from "../types";


/**
 * Sandbox backed by an Antigravity managed agent.
 *
 * The agent is used as a remote shell only: every call tells it to run one exact command and
 * return the output untouched. Free-form tasks are slow (~2 min, ~70k tokens); a tight
 * one-command call takes ~20 s and ~12k tokens.
 */
export class AntigravitySandbox implements Sandbox {
  environmentId: string | null;
  readonly calls: CallTiming[] = [];

  constructor(
    private readonly budget: TokenBudget,
    environmentId: string | null = null,
    private readonly envVars: Record<string, string> = {},
  ) {
    this.environmentId = environmentId;
  }

  /**
   * Run one command. `files` are written first, inside the same command, as checksummed heredocs: the agent retypes
   * the command, so every file is verified with sha256 and the call is retried if a transcription error slipped in.
   */
  async run(cmd: string, label = "run", files: SandboxFile[] = []): Promise<ExecResult> {
    const full = files.length ? `${writeFilesCommand(files)} && ${cmd}` : cmd;
    for (let attempt = 1; ; attempt++) {
      const r = await this.runOnce(full, attempt === 1 ? label : `${label}-retry${attempt - 1}`);
      const bad = r.stdout.includes("PAYLOAD_BAD");
      if (!bad || attempt >= 3) return r;
    }
  }

  private async runOnce(cmd: string, label: string): Promise<ExecResult> {
    const started = Date.now();
    // The exit code is appended by the wrapper, because the agent only returns stdout/stderr.
    const wrapped = `( ${cmd} ); echo "[EXIT:$?]"`;
    const r = await withRetry(() =>
      gemini().interactions.create({
        agent: MODELS.sandboxAgent,
        agent_config: { type: "antigravity", model: MODELS.sandboxAgentModel },
        stream: false,
        input:
          "Run exactly this bash command with no changes and no other commands. " +
          "Do not explain anything.\n" + wrapped,
        environment: {
          type: "remote",
          network: SANDBOX_NETWORK,
          env: this.envVars,
          ...(this.environmentId ? { environment_id: this.environmentId } : {}),
        },
      }),
    );
    this.budget.add(r.usage?.total_tokens);
    this.calls.push({ label, ms: Date.now() - started, tokens: r.usage?.total_tokens ?? 0 });
    if (r.environment_id) this.environmentId = r.environment_id;

    const results = (r.steps ?? []).filter((s) => s.type === "code_execution_result");
    const raw = results.map((s) => String(s.result)).join("\n");
    const exit = raw.match(/\[EXIT:(\d+)\]/);
    const stdout = raw.split("[STDERR]")[0].replace("[STDOUT]", "").replace(/\[EXIT:\d+\]/, "").trim();
    const stderr = (raw.split("[STDERR]")[1] ?? "").trim();
    return { code: exit ? Number(exit[1]) : -1, stdout, stderr };
  }

  /** Write files and run a command, in one call. */
  async runWith(files: SandboxFile[], cmd: string, label?: string): Promise<ExecResult> {
    return this.run(cmd, label, files);
  }

  async readFile(path: string): Promise<string> {
    const r = await this.run(`cat ${JSON.stringify(path)}`);
    if (r.code !== 0) throw new Error(`readFile ${path}: ${r.stderr}`);
    return r.stdout;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const r = await this.runWith([{ path, content }], `test -f ${JSON.stringify(path)}`, "writeFile");
    if (r.code !== 0) throw new Error(`writeFile ${path} failed: ${r.stderr}`);
  }

  async destroy(): Promise<void> {
    // Environments are reused between runs; nothing to tear down yet.
  }
}

/** Files may only go under /opt or /workspace, with no "..". */
export function assertSandboxPath(path: string): void {
  if (!/^\/(opt|workspace)\/[\w./@-]+$/.test(path) || path.includes("..")) {
    throw new Error(`Refusing to write outside /opt or /workspace: ${path}`);
  }
}

/** Shell snippet that writes each file from a quoted heredoc and aborts with PAYLOAD_BAD if the sha256 does not match. */
export function writeFilesCommand(files: SandboxFile[]): string {
  return files
    .map((f) => {
      assertSandboxPath(f.path);
      const content = f.content.endsWith("\n") ? f.content : `${f.content}\n`;
      const sha = createHash("sha256").update(content).digest("hex");
      const tag = `__EOF_${sha.slice(0, 10)}__`;
      return (
        `mkdir -p "$(dirname '${f.path}')" && cat > '${f.path}' <<'${tag}'\n${content}${tag}\n` +
        `echo '${sha}  ${f.path}' | sha256sum -c - >/dev/null 2>&1 || { echo PAYLOAD_BAD ${f.path}; exit 97; }`
      );
    })
    .join("\n");
}
