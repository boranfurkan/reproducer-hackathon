import type { EnvProfile } from "../types";

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
