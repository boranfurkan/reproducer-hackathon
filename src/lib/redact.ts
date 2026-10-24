// Remove secrets before anything is stored or shown. User env vars and tokens must never reach MongoDB or the timeline.

const PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{30,}/g, // Google API keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /mongodb(\+srv)?:\/\/[^\s"'<>]+/g, // connection strings carry passwords
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
];

/** Redact known secret shapes, plus any exact secret values the caller knows about (for example user env var values). */
export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) if (s.length >= 4) out = out.split(s).join("[REDACTED]");
  for (const re of PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

/** Redact every string inside a JSON-like value. */
export function redactDeep<T>(value: T, secrets: string[] = []): T {
  if (typeof value === "string") return redact(value, secrets) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, secrets)])) as T;
  }
  return value;
}
