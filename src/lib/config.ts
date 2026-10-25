// Central place for model names and safety caps. Change values here, not in call sites.

export const MODELS = {
  brain: "gemini-4-argon",
  sandboxAgent: "antigravity-preview-09-2026",
  // The model that runs inside the Antigravity agent. It only executes exact commands, so this barely affects speed (measured 13 to 15 s
  // per call for Argon against 13 s for the default Flash) but makes Argon the model behind every step. Set SANDBOX_AGENT_MODEL to override.
  sandboxAgentModel: process.env.SANDBOX_AGENT_MODEL || "gemini-4-argon",
  summary: "gemini-3.8-flash",
} as const;

// Caps keep a single investigation modest (the hackathon account is monitored for abuse).
export const LIMITS = {
  maxMatrixRounds: 4,
  maxFixAttempts: 3,
  maxProfilesPerRound: 13,
  maxTokensPerRun: 600_000,
  retryAttempts: 4,
} as const;

// Egress allowlist for the sandbox. Widen only as needed.
export const SANDBOX_NETWORK = { allowlist: [{ domain: "*" }] };
