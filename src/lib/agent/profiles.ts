import type { Engine, EnvProfile } from "../types";
import { REMOVABLE_APIS } from "../harness/conditions";
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

export type Variable = "engine" | "locale" | "timezone" | "device" | "storage" | "colorScheme" | "reducedMotion" | "translation" | "adBlock" | "olderBrowser" | "network";

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
    case "reducedMotion": return !!p.reducedMotion;
    case "translation": return !!p.translated;
    case "adBlock": return !!p.adBlock;
    case "olderBrowser": return !!p.removeApis?.length;
    case "network": return !!p.latencyMs;
  }
}

/** The reporter's profile with exactly one variable reset to baseline, for each variable that differs. */
export function ablations(reporter: EnvProfile): Ablation[] {
  const vars: Variable[] = ["engine", "locale", "timezone", "device", "storage", "colorScheme", "reducedMotion", "translation", "adBlock", "olderBrowser", "network"];
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
      case "reducedMotion": p.reducedMotion = false; break;
      case "translation": p.translated = false; break;
      case "adBlock": p.adBlock = false; break;
      case "olderBrowser": p.removeApis = []; break;
      case "network": p.latencyMs = 0; break;
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
/**
 * The reporter's profile with one set of overrides applied (model output, so it is validated: unknown fields are dropped, invalid locales and
 * timezones are ignored, removed APIs must be on the list). Returns the profile and whether anything changed.
 */
export function applyOverrides(reporter: EnvProfile, o: Stressor["override"] = {}, name = "variant"): { profile: EnvProfile; changed: boolean } {
  const p: EnvProfile = { ...reporter, name };
  let changed = false;
  if (o.engine && ENGINES.includes(o.engine as Engine) && o.engine !== p.engine) { p.engine = o.engine as Engine; changed = true; }
  if (o.locale && validLocale(o.locale) && o.locale !== p.locale) { p.locale = o.locale; changed = true; }
  if (o.timezoneId && validTimezone(o.timezoneId) && o.timezoneId !== p.timezoneId) { p.timezoneId = o.timezoneId; changed = true; }
  if ((o.colorScheme === "dark" || o.colorScheme === "light") && o.colorScheme !== (p.colorScheme ?? "light")) { p.colorScheme = o.colorScheme; changed = true; }
  if (typeof o.storageBlocked === "boolean" && o.storageBlocked !== !!p.storageBlocked) { p.storageBlocked = o.storageBlocked; changed = true; }
  if (typeof o.reducedMotion === "boolean" && o.reducedMotion !== !!p.reducedMotion) { p.reducedMotion = o.reducedMotion; changed = true; }
  if (typeof o.translated === "boolean" && o.translated !== !!p.translated) { p.translated = o.translated; changed = true; }
  if (typeof o.adBlock === "boolean" && o.adBlock !== !!p.adBlock) { p.adBlock = o.adBlock; changed = true; }
  if (Array.isArray(o.removeApis)) {
    const apis = o.removeApis.filter((a) => (REMOVABLE_APIS as readonly string[]).includes(a));
    if (apis.join() !== (p.removeApis ?? []).join()) { p.removeApis = apis; changed = true; }
  }
  if (typeof o.latencyMs === "number" && o.latencyMs >= 0 && o.latencyMs !== (p.latencyMs ?? 0)) { p.latencyMs = Math.min(Math.round(o.latencyMs), 3000); changed = true; }
  return { profile: p, changed };
}

export const slugOf = (name: string, fallback: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || fallback;

/**
 * The reporter's profile with one extra condition added, for each stressor the model proposed.
 * Model output is validated (see applyOverrides). A stressor that changes nothing (the reporter already has that value) is skipped.
 */
export function stressorProfiles(reporter: EnvProfile, stressors: Stressor[], max = 3): EnvProfile[] {
  const out: EnvProfile[] = [];
  for (const st of stressors) {
    if (out.length >= max) break;
    const { profile, changed } = applyOverrides(reporter, st.override ?? {}, `add-${slugOf(st.name, `stress-${out.length + 1}`)}`);
    if (changed && !out.some((x) => x.name === profile.name)) out.push(profile);
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

/**
 * The canonical name of the one thing that separates the failing profile from the reporter's: engine, locale, timezone, storage,
 * colourScheme, reducedMotion or device. Used to name what isolated a bug, so that memory and facets do not split the same cause
 * under the different names a model gives its extra conditions ("storage-blocked", "blocked-web-storage").
 */
export function canonicalVariable(reporter: EnvProfile, failing: EnvProfile): string {
  if (failing.storageBlocked !== reporter.storageBlocked && !!failing.storageBlocked !== !!reporter.storageBlocked) return "storage";
  if (failing.locale !== reporter.locale) return "locale";
  if (failing.timezoneId !== reporter.timezoneId) return "timezone";
  if (failing.engine !== reporter.engine) return "engine";
  if ((failing.colorScheme ?? "light") !== (reporter.colorScheme ?? "light")) return "colorScheme";
  if (!!failing.reducedMotion !== !!reporter.reducedMotion) return "reducedMotion";
  if (!!failing.translated !== !!reporter.translated) return "translation";
  if (!!failing.adBlock !== !!reporter.adBlock) return "adBlock";
  if ((failing.removeApis ?? []).join() !== (reporter.removeApis ?? []).join()) return "olderBrowser";
  if ((failing.latencyMs ?? 0) !== (reporter.latencyMs ?? 0)) return "network";
  return "device";
}

/** How a matrix row relates to the reporter, for the matrix table. */
export type RowKind = "as reported" | "neutral" | "reset one" | "added";

export const rowKind = (name: string): RowKind => (name === "reporter" ? "as reported" : name === "baseline" ? "neutral" : name.startsWith("reset-") ? "reset one" : "added");

const viewportText = (p: EnvProfile) => `${p.viewport.width}×${p.viewport.height}`;

/** One line describing a profile: locale, timezone, viewport and anything unusual. */
export function describeProfile(p: EnvProfile): string {
  return [p.locale, p.timezoneId, viewportText(p), p.storageBlocked ? "storage blocked" : "", p.colorScheme === "dark" ? "dark mode" : "", p.reducedMotion ? "reduced motion" : "", p.translated ? "page translated" : "", p.adBlock ? "ad blocker" : "", p.removeApis?.length ? `older browser (no ${p.removeApis.map((a) => a.split(".").pop()).join(", ")})` : "", p.latencyMs ? `slow network (+${p.latencyMs} ms)` : ""].filter(Boolean).join(" · ");
}

/** What differs from the reporter in a reset or added row, in words ("en-US instead of tr-TR", "storage blocked"). Empty for other rows. */
export function describeChange(reporter: EnvProfile, p: EnvProfile): string {
  const parts: string[] = [];
  if (p.engine !== reporter.engine) parts.push(`${p.engine} instead of ${reporter.engine}`);
  if (p.locale !== reporter.locale) parts.push(`${p.locale} instead of ${reporter.locale}`);
  if (p.timezoneId !== reporter.timezoneId) parts.push(`${p.timezoneId} instead of ${reporter.timezoneId}`);
  if (!!p.storageBlocked !== !!reporter.storageBlocked) parts.push(p.storageBlocked ? "storage blocked" : "storage allowed");
  if ((p.colorScheme ?? "light") !== (reporter.colorScheme ?? "light")) parts.push(`${p.colorScheme ?? "light"} mode`);
  if (!!p.reducedMotion !== !!reporter.reducedMotion) parts.push(p.reducedMotion ? "reduced motion" : "motion allowed");
  if (!!p.translated !== !!reporter.translated) parts.push(p.translated ? "page translated" : "page not translated");
  if (!!p.adBlock !== !!reporter.adBlock) parts.push(p.adBlock ? "ad blocker on" : "ad blocker off");
  if ((p.removeApis ?? []).join() !== (reporter.removeApis ?? []).join()) parts.push(p.removeApis?.length ? `older browser (no ${p.removeApis.map((a) => a.split(".").pop()).join(", ")})` : "current browser");
  if ((p.latencyMs ?? 0) !== (reporter.latencyMs ?? 0)) parts.push(p.latencyMs ? `slow network (+${p.latencyMs} ms)` : "normal network");
  if (viewportText(p) !== viewportText(reporter) || p.deviceScaleFactor !== reporter.deviceScaleFactor || p.isMobile !== reporter.isMobile) parts.push(`${viewportText(p)}${p.isMobile ? "" : " desktop"} instead of ${viewportText(reporter)}`);
  return parts.join(", ");
}
