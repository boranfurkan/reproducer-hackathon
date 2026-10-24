import type { Engine, EnvProfile } from "../types";
import type { Stressor } from "./schemas";

/** Neutral desktop profile. Resetting one field of the reporter's profile to this value tests that variable. */
export const BASELINE: Omit<EnvProfile, "name" | "notEmulated"> = {
  engine: "chromium",
  locale: "en-US",
  timezoneId: "UTC",
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  colorScheme: "light",
  storageBlocked: false,
};

export type Variable = "engine" | "locale" | "timezone" | "device" | "storage" | "colorScheme";

export interface Ablation {
  variable: Variable;
  profile: EnvProfile;
}

const sameViewport = (a: EnvProfile, b: typeof BASELINE) =>
  a.viewport.width === b.viewport.width && a.viewport.height === b.viewport.height;

/** True when the reporter's value for this variable differs from the baseline. */
function differs(p: EnvProfile, v: Variable): boolean {
  switch (v) {
    case "engine": return p.engine !== BASELINE.engine;
    case "locale": return p.locale !== BASELINE.locale;
    case "timezone": return p.timezoneId !== BASELINE.timezoneId;
    case "device":
      return !sameViewport(p, BASELINE) || p.deviceScaleFactor !== BASELINE.deviceScaleFactor ||
        p.isMobile !== BASELINE.isMobile || p.hasTouch !== BASELINE.hasTouch || !!p.userAgent;
    case "storage": return !!p.storageBlocked;
    case "colorScheme": return (p.colorScheme ?? "light") !== "light";
  }
}

/** The reporter's profile with exactly one variable reset to baseline, for each variable that differs. */
export function ablations(reporter: EnvProfile): Ablation[] {
  const vars: Variable[] = ["engine", "locale", "timezone", "device", "storage", "colorScheme"];
  return vars.filter((v) => differs(reporter, v)).map((variable) => {
    const p: EnvProfile = { ...reporter, name: `reset-${variable}` };
    switch (variable) {
      case "engine": p.engine = BASELINE.engine; break;
      case "locale": p.locale = BASELINE.locale; break;
      case "timezone": p.timezoneId = BASELINE.timezoneId; break;
      case "device":
        p.viewport = BASELINE.viewport; p.deviceScaleFactor = 1; p.isMobile = false; p.hasTouch = false;
        delete p.userAgent;
        break;
      case "storage": p.storageBlocked = false; break;
      case "colorScheme": p.colorScheme = "light"; break;
    }
    return { variable, profile: p };
  });
}

export function baselineProfile(reporter: EnvProfile): EnvProfile {
  return { ...BASELINE, name: "baseline", notEmulated: reporter.notEmulated };
}

// Engines installed in the sandbox. Firefox is not: it needs MOZ_DISABLE_CONTENT_SANDBOX=1 and an extra download.
const ENGINES: Engine[] = ["chromium", "webkit"];

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validLocale(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

/**
 * The reporter's profile with one extra condition added, for each stressor the model proposed.
 * Model output is validated: unknown fields are dropped, invalid locales and timezones are skipped.
 * A stressor that changes nothing (the reporter already has that value) is skipped too.
 */
export function stressorProfiles(reporter: EnvProfile, stressors: Stressor[], max = 3): EnvProfile[] {
  const out: EnvProfile[] = [];
  for (const st of stressors) {
    if (out.length >= max) break;
    const o = st.override ?? {};
    const p: EnvProfile = { ...reporter };
    let changed = false;
    if (o.engine && ENGINES.includes(o.engine as Engine) && o.engine !== p.engine) { p.engine = o.engine as Engine; changed = true; }
    if (o.locale && validLocale(o.locale) && o.locale !== p.locale) { p.locale = o.locale; changed = true; }
    if (o.timezoneId && validTimezone(o.timezoneId) && o.timezoneId !== p.timezoneId) { p.timezoneId = o.timezoneId; changed = true; }
    if ((o.colorScheme === "dark" || o.colorScheme === "light") && o.colorScheme !== (p.colorScheme ?? "light")) { p.colorScheme = o.colorScheme; changed = true; }
    if (typeof o.storageBlocked === "boolean" && o.storageBlocked !== !!p.storageBlocked) { p.storageBlocked = o.storageBlocked; changed = true; }
    if (typeof o.reducedMotion === "boolean" && o.reducedMotion !== !!p.reducedMotion) { p.reducedMotion = o.reducedMotion; changed = true; }
    if (!changed) continue;
    const slug = st.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || `stress-${out.length + 1}`;
    p.name = `add-${slug}`;
    out.push(p);
  }
  return out;
}

/** The part of a replay result that decides whether two failures are the same problem. */
export interface ReplayRow {
  name: string;
  ok: boolean;
  failure: string | null;
  errors?: string[];
}

/** What went wrong in a profile as a comparable string: the failed step plus the first console error. */
export const failureSignature = (r: ReplayRow): string => `${r.failure ?? ""}|${r.errors?.[0] ?? ""}`;

/**
 * A repository can hold several bugs, and the extra-condition profiles find them. After a fix, only these profiles must pass:
 * the ones that passed before, the focus, and the ones that failed before in the same way as the focus (same failed step, same first console error).
 * The others failed for a different reason: they are other problems, reported but not required and not to be fixed in this change.
 */
export function splitByIssue(round1: ReplayRow[], focusName: string): { required: Set<string>; unrelated: ReplayRow[] } {
  const focus = round1.find((r) => r.name === focusName);
  const required = new Set(round1.filter((r) => r.ok || r.name === focusName || (focus !== undefined && failureSignature(r) === failureSignature(focus))).map((r) => r.name));
  return { required, unrelated: round1.filter((r) => !required.has(r.name)) };
}
