import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnvProfile } from "../types";
import { applyOverrides } from "./profiles";
import { Trail, earlierRunSummary, experimentKey, formatEarlierRuns, formatFixAttempts, formatTriedShort, reusableResults, type EarlierRun } from "./trail";

const reporter: EnvProfile = {
  name: "reporter", engine: "chromium", locale: "de-DE", timezoneId: "Europe/Berlin", viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1, isMobile: false, hasTouch: false, notEmulated: ["GPU"],
};
const steps = [{ action: "goto" as const, url: "/apps/storefront/" }, { action: "expect_visible" as const, selector: "[data-testid=cart]" }];

test("the experiment key ignores the variant's name and notes, and changes with the environment, the steps and the probe", () => {
  const a = applyOverrides(reporter, { translated: true }, "translated").profile;
  const b = applyOverrides({ ...reporter, notEmulated: ["something else"] }, { translated: true }, "page-translated").profile;
  assert.equal(experimentKey(a, steps), experimentKey(b, steps), "same browser, same steps: same key");
  assert.notEqual(experimentKey(a, steps), experimentKey(applyOverrides(reporter, { adBlock: true }, "x").profile, steps));
  assert.notEqual(experimentKey(a, steps), experimentKey(a, steps.slice(0, 1)));
  assert.notEqual(experimentKey(a, steps), experimentKey(a, steps, "document.title"));
});

test("a trail keeps each file once, bounds its lists, and keeps only the latest result of a matrix row", () => {
  const t = new Trail();
  assert.equal(t.empty, true);
  t.file("apps/storefront/app.js");
  t.file("apps/storefront/app.js");
  for (let i = 0; i < 10; i++) t.thought(`thought ${i}`);
  t.rows("matrix", [{ name: "reporter", ok: true, failure: null, change: "" }]);
  t.rows("matrix", [{ name: "reporter", ok: false, failure: "expect_visible", change: "" }]);
  assert.deepEqual(t.filesRead, ["apps/storefront/app.js"]);
  assert.equal(t.thoughts.length, 6);
  assert.equal(t.thoughts.at(-1), "thought 9");
  assert.equal(t.tried.length, 1);
  assert.equal(t.tried[0].ok, false);
  assert.equal(t.empty, false);
});

function earlierRun(over: Partial<EarlierRun> = {}): EarlierRun {
  const t = new Trail();
  t.treeSha = "tree1";
  t.rows("experiment", [{ name: "translated", ok: false, failure: "expect_visible", change: "page translated", probe: "font" }], { probe: "document.querySelector('font')?.tagName", keys: new Map([["translated", "k1"]]) });
  t.rows("experiment", [{ name: "adblock", ok: true, failure: null, change: "content blocker" }], { keys: new Map([["adblock", "k2"]]) });
  t.file("vendor/react-dom@18.2.0/umd/react-dom.development.js");
  t.hypothesis = { rootCause: "React removes a text node the translator replaced", file: "apps/storefront/app.js", explanation: "" };
  t.missing = ["Which browser extension the reporter uses"];
  t.fixAttempts.push({ attempt: 1, rootCause: "", file: "apps/storefront/app.js", summary: "Wrapped the summary in a span", outcome: "The test must fail before the fix" });
  return { ...t.data(), createdAt: new Date("2026-10-25T09:00:00Z"), outcome: "stopped", mode: "deep", minutes: 6, ...over };
}

test("notes of an earlier run read as a summary, a short list of conditions and a full hand-over", () => {
  const n = earlierRun();
  assert.match(earlierRunSummary(n), /2 environments tried \(2 in experiments\), 1 showed the bug, 1 file read, 1 fix rejected by verification; best explanation: React removes/);
  assert.equal(formatTriedShort([n]), "- page translated: showed the bug\n- content blocker: passed");
  const full = formatEarlierRuns([n]);
  assert.match(full, /stopped after 6 min/);
  assert.match(full, /experiment translated \[page translated\]: FAIL at expect_visible \| probe document\.querySelector\('font'\)\?\.tagName → font/);
  assert.match(full, /What it said was still missing: Which browser extension/);
  assert.match(formatFixAttempts([n]), /Wrapped the summary in a span \(rejected: The test must fail before the fix\)/);
});

test("stored experiment results are reused only for the same code", () => {
  const n = earlierRun();
  assert.deepEqual([...reusableResults([n], "tree1").keys()], ["k1", "k2"]);
  assert.equal(reusableResults([n], "tree2").size, 0, "the code changed: run again");
  assert.equal(reusableResults([n], undefined).size, 0);
});
