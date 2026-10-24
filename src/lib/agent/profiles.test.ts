import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnvProfile } from "../types";
import { BASELINE, ablations, baselineProfile, splitByIssue, stressorProfiles } from "./profiles";

const reporter: EnvProfile = {
  name: "reporter", engine: "webkit", locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3, isMobile: true, hasTouch: true, notEmulated: ["GPU"],
};

test("ablations reset exactly one variable each, only for variables that differ from the baseline", () => {
  const list = ablations(reporter);
  assert.deepEqual(list.map((a) => a.variable).sort(), ["device", "engine", "locale", "timezone"]);
  const locale = list.find((a) => a.variable === "locale")!.profile;
  assert.equal(locale.locale, BASELINE.locale);
  assert.equal(locale.engine, reporter.engine, "other variables stay as the reporter has them");
  const device = list.find((a) => a.variable === "device")!.profile;
  assert.deepEqual([device.isMobile, device.hasTouch, device.deviceScaleFactor], [false, false, 1]);
});

test("a desktop profile with nothing unusual has nothing to reset", () => {
  assert.deepEqual(ablations({ ...BASELINE, name: "x", notEmulated: [] }), []);
});

test("baseline keeps the reporter's list of what cannot be emulated", () => {
  assert.deepEqual(baselineProfile(reporter).notEmulated, ["GPU"]);
  assert.equal(baselineProfile(reporter).name, "baseline");
});

test("stressors: valid ones are applied, invalid, no-op and unknown ones are dropped, at most `max`", () => {
  const out = stressorProfiles(
    reporter,
    [
      { name: "Storage blocked (in-app browser)", why: "", override: { storageBlocked: true } },
      { name: "LA", why: "", override: { timezoneId: "America/Los_Angeles" } },
      { name: "bad zone", why: "", override: { timezoneId: "Mars/Olympus" } },
      { name: "bad locale", why: "", override: { locale: "not a locale!!" } },
      { name: "same as reporter", why: "", override: { locale: "tr-TR" } },
      { name: "unknown field only", why: "", override: { shellCommand: "rm -rf /" } as never },
      { name: "dark", why: "", override: { colorScheme: "dark" } },
      { name: "firefox", why: "", override: { engine: "firefox" } }, // not installed in the sandbox: never offered
    ],
    2,
  );
  assert.equal(out.length, 2);
  assert.ok(out.every((p) => p.engine !== "firefox"));
  assert.equal(out[0].storageBlocked, true);
  assert.equal(out[0].name, "add-storage-blocked-in-app-brows");
  assert.equal(out[1].timezoneId, "America/Los_Angeles");
  assert.ok(!("shellCommand" in out[0]));
});

test("only the profiles that belong to this issue are required to pass after the fix", () => {
  const empty = { failure: "expect_count_min [data-testid=\"book-card\"]: stayed below 1", errors: [] as string[] };
  const round1 = [
    { name: "reporter", ok: false, ...empty },
    { name: "baseline", ok: true, failure: null },
    { name: "reset-locale", ok: true, failure: null },
    { name: "reset-timezone", ok: false, ...empty }, // still has the locale cause: same failure, so it must pass after the fix
    { name: "add-azerbaijani", ok: false, ...empty },
    { name: "add-storage-blocked", ok: false, failure: empty.failure, errors: ["The operation is insecure."] }, // another bug (same step, different console error)
  ];
  const { required, unrelated } = splitByIssue(round1, "reporter");
  assert.deepEqual([...required].sort(), ["add-azerbaijani", "baseline", "reporter", "reset-locale", "reset-timezone"]);
  assert.deepEqual(unrelated.map((r) => r.name), ["add-storage-blocked"]);
});

test("when a stressor is the focus, the passing reporter and the other passing profiles stay required", () => {
  const round1 = [
    { name: "reporter", ok: true, failure: null },
    { name: "baseline", ok: true, failure: null },
    { name: "add-storage-blocked", ok: false, failure: "expect_visible: timeout", errors: ["The operation is insecure."] },
    { name: "add-dark", ok: true, failure: null },
  ];
  const { required, unrelated } = splitByIssue(round1, "add-storage-blocked");
  assert.deepEqual([...required].sort(), ["add-dark", "add-storage-blocked", "baseline", "reporter"]);
  assert.deepEqual(unrelated, []);
});
