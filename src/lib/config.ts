// Central place for model names and safety caps. Change values here, not in call sites.

export const MODELS = {
  brain: "gemini-4-argon",
  sandboxAgent: "antigravity-preview-09-2026",
  summary: "gemini-3.8-flash",
} as const;

// Caps keep a single investigation modest (the hackathon account is monitored for abuse).
export const LIMITS = {
  maxMatrixRounds: 4,
  maxFixAttempts: 3,
  maxProfilesPerRound: 6,
  maxTokensPerRun: 600_000,
  retryAttempts: 4,
} as const;

// Egress allowlist for the sandbox. Widen only as needed.
export const SANDBOX_NETWORK = { allowlist: [{ domain: "*" }] };
