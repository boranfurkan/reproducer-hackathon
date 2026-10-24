import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunDoc } from "../events";
import { buildPrBody, pullRequestTitle } from "./pr";

const run = {
  title: "Category pages empty for some customers",
  rootCause: {
    file: "src/categories.js",
    rootCause: "src/categories.js converts URL category slugs into server category keys with a locale-sensitive upper-casing that breaks under Turkish.",
    explanation: "Under tr-TR, 'fiction'.toLocaleUpperCase(navigator.language) gives a dotted capital I, so the key never matches.",
  },
  profile: { engine: "chromium", locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 412, height: 915 }, hasTouch: true, notEmulated: ["Real GPU"] },
  decisiveVariables: ["locale"],
  matrix: [
    { name: "reporter", ok: true, failure: null },
    { name: "add-storage-blocked", ok: false, failure: "x" },
  ],
  otherProblems: [{ profile: "add-storage-blocked", problem: "The operation is insecure." }],
} as unknown as RunDoc;

test("the title is one plain line without backticks, cut at a word boundary, and never doubles a Fix prefix", () => {
  assert.equal(pullRequestTitle({ ...run, prTitle: "Use locale-independent upper-casing for category keys" }), "Fix: Use locale-independent upper-casing for category keys");
  assert.equal(pullRequestTitle({ ...run, prTitle: "Fix the date shown to users west of UTC" }), "Fix the date shown to users west of UTC");
  const fallback = pullRequestTitle({ ...run, prTitle: undefined });
  assert.ok(!fallback.includes("`") && !fallback.includes("\n"), fallback);
  assert.ok(fallback.length <= 75, `${fallback.length}: ${fallback}`);
  assert.equal(pullRequestTitle({ ...run, prTitle: "  spaced\n  out `title`  " }), "Fix: spaced out title");
});

test("the description does not repeat the file name and marks rows that belong to a different bug", async () => {
  const body = await buildPrBody(run, 1, "A short summary.");
  assert.match(body, /^Fixes #1/);
  assert.ok(!body.includes("src/categories.js: src/categories.js"), "no repeated file name");
  assert.match(body, /In `src\/categories\.js`: converts URL category slugs/);
  assert.match(body, /\| reporter \| passes \|/);
  assert.match(body, /\| add-storage-blocked \| fails: a different bug, not part of this change \|/);
  assert.match(body, /## Not part of this change/);
  assert.match(body, /every environment that belongs to this issue/);
});

test("the description explains the platform behaviour with its sources when the investigation found them", async () => {
  const withWhy = { ...run, explainer: { text: "Turkish has a dotted capital I.", sources: [{ title: "mozilla.org", url: "https://example.test/mdn" }] } } as unknown as RunDoc;
  const body = await buildPrBody(withWhy, 1, "A short summary.");
  assert.match(body, /## Why this happens\nTurkish has a dotted capital I\.\n- \[mozilla\.org\]\(https:\/\/example\.test\/mdn\)/);
  assert.ok(!(await buildPrBody(run, 1, "x")).includes("Why this happens"));
});
