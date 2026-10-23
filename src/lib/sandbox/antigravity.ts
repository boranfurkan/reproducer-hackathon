import { MODELS, SANDBOX_NETWORK } from "../config";
import { TokenBudget, gemini, withRetry } from "../gemini";
import type { ExecResult, Sandbox } from "../types";

/**
 * Sandbox backed by an Antigravity managed agent.
 *
 * The agent is used as a remote shell only: every call tells it to run one exact command and
 * return the output untouched. Free-form tasks are slow (~2 min, ~70k tokens); a tight
 * one-command call takes ~20 s and ~12k tokens.
 */
export class AntigravitySandbox implements Sandbox {
  environmentId: string | null;

  constructor(
    private readonly budget: TokenBudget,
    environmentId: string | null = null,
    private readonly envVars: Record<string, string> = {},
  ) {
    this.environmentId = environmentId;
  }

  async run(cmd: string): Promise<ExecResult> {
    // The exit code is appended by the wrapper, because the agent only returns stdout/stderr.
    const wrapped = `( ${cmd} ); echo "[EXIT:$?]"`;
    const r = await withRetry(() =>
      gemini().interactions.create({
        agent: MODELS.sandboxAgent,
        stream: false,
        agent_config: { type: "antigravity" },
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
    if (r.environment_id) this.environmentId = r.environment_id;

    const results = (r.steps ?? []).filter((s) => s.type === "code_execution_result");
    const raw = results.map((s) => String(s.result)).join("\n");
    const exit = raw.match(/\[EXIT:(\d+)\]/);
    const stdout = raw.split("[STDERR]")[0].replace("[STDOUT]", "").replace(/\[EXIT:\d+\]/, "").trim();
    const stderr = (raw.split("[STDERR]")[1] ?? "").trim();
    return { code: exit ? Number(exit[1]) : -1, stdout, stderr };
  }

  /**
   * Make sure Playwright and its browsers exist in this environment. Environment ids outlive their
   * files (an hours-old id resolved but /opt/pw was gone), so check first and install only if
   * missing. A cold install takes ~150 s, so run this before a demo, not during it.
   */
  async ensureReady(): Promise<{ installed: boolean }> {
    const probe = await this.run(
      "test -d /opt/pw/node_modules/playwright && ls ~/.cache/ms-playwright | grep -c -E 'chromium|webkit'",
    );
    if (probe.code === 0 && Number(probe.stdout.trim()) >= 2) return { installed: false };
    const r = await this.run(
      "mkdir -p /opt/pw && cd /opt/pw && npm init -y >/dev/null 2>&1 && npm i playwright && npx playwright install --with-deps chromium webkit",
    );
    if (r.code !== 0) throw new Error(`Playwright install failed: ${r.stderr.slice(0, 500)}`);
    return { installed: true };
  }

  async readFile(path: string): Promise<string> {
    const r = await this.run(`cat ${JSON.stringify(path)}`);
    if (r.code !== 0) throw new Error(`readFile ${path}: ${r.stderr}`);
    return r.stdout;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const b64 = Buffer.from(content, "utf8").toString("base64");
    const r = await this.run(`mkdir -p "$(dirname ${JSON.stringify(path)})" && echo ${b64} | base64 -d > ${JSON.stringify(path)}`);
    if (r.code !== 0) throw new Error(`writeFile ${path}: ${r.stderr}`);
  }

  async destroy(): Promise<void> {
    // Environments are reused between runs; nothing to tear down yet.
  }
}
