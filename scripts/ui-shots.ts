// Screenshots of every page, one colour scheme, desktop and phone width, with fake data, for reviewing a redesign.
//
//   npm run dev                      # in one terminal (or: npm run build && npm start)
//   npm run ui:shots                 # in another; add  -- --base http://localhost:3001  for another port
//
// It seeds one finished and one running investigation for a fake user "tester" in MongoDB, mocks the GitHub-backed calls (repositories and
// issues) in the browser, signs in with a session cookie built from AUTH_SECRET, takes the screenshots into .ui-shots/, and deletes the seeded
// data again. Nothing real is read or written on GitHub.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { seal } from "../src/lib/auth";
import { collection, closeMongo } from "../src/lib/mongo";
import type { RunDoc, RunEventDoc } from "../src/lib/events";

const args = process.argv.slice(2);
const base = (args.includes("--base") ? args[args.indexOf("--base") + 1] : undefined) ?? "http://localhost:3000";
const out = ".ui-shots";
const FAKE = "ui-shots-tester";

const eng = (c: boolean, w = c) => ({ chromium: { ok: c, failure: c ? null : "expect_count_min: count stayed below 1" }, webkit: { ok: w, failure: w ? null : "expect_count_min: count stayed below 1" } });
const matrix = (fixed: boolean) => [
  { name: "reporter", kind: "as reported", env: "tr-TR · Europe/Istanbul · 412×1004", ok: fixed, failure: fixed ? null : "expect_count_min: count stayed below 1", errors: [] as string[], engines: eng(fixed) },
  { name: "baseline", kind: "neutral", env: "en-US · UTC · 1280×720", ok: true, failure: null, errors: [] as string[], engines: eng(true) },
  { name: "reset-locale", kind: "reset one", env: "", change: "en-US instead of tr-TR", ok: true, failure: null, errors: [] as string[], engines: eng(true) },
  { name: "reset-timezone", kind: "reset one", env: "", change: "UTC instead of Europe/Istanbul", ok: fixed, failure: fixed ? null : "expect_count_min: count stayed below 1", errors: [] as string[], engines: eng(fixed) },
  { name: "add-storage-blocked", kind: "added", env: "", change: "storage blocked", ok: false, failure: "expect_visible: timeout", errors: ["The operation is insecure."], engines: eng(false) },
];

async function seed() {
  const { ObjectId } = await import("mongodb");
  const runs = await collection<RunDoc>("runs");
  const events = await collection<RunEventDoc>("run_events");
  const fixed = new ObjectId();
  const running = new ObjectId();
  const stopped = new ObjectId();
  const mkEvents = (runId: InstanceType<typeof ObjectId>, upTo: number): RunEventDoc[] =>
    (
      [
        ["boot", 4000, "Sandbox ready", undefined],
        ["understood", 14000, "Customers in Turkey using Chrome on an Android phone see an empty category page.", { mediaObservations: "The user opens the shop, taps Fiction and sees \"No books in this category yet\"." }],
        ["profile", 14500, "chromium, tr-TR, Europe/Istanbul, 412x1004, touch", { engine: "chromium", locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 412, height: 1004 }, deviceScaleFactor: 2.625, hasTouch: true }],
        ["hypothesis", 21000, "Replay plan: 3 steps. Success means: the Fiction page shows at least one book card.", undefined],
        ["matrix", 70000, "Matrix round 1 (5 profiles)", matrix(false)],
        ["hypothesis", 70100, "Other problems seen while investigating, not part of this issue: add-storage-blocked (The operation is insecure.)", undefined],
        ["hypothesis", 70200, "Resetting locale makes the bug disappear", undefined],
        ["memory", 71000, "Seen something similar before: Search shows no results for some customers (src/search.js, isolated by locale)", [{ id: "x", title: "Search shows no results for some customers", isolatedVariable: "locale", file: "src/search.js", score: 0.016 }]],
        ["root_cause", 95000, "src/categories.js: upper-casing with the visitor's locale turns i into a dotted capital I under Turkish.", undefined],
        ["test_written", 190000, "Test before the fix: 1 failed, 1 passed (red as required)", "Running 2 tests\n  1 failed\n  1 passed"],
        ["fix_attempt", 190100, "Attempt 1: use locale-independent toUpperCase().", undefined],
        ["matrix", 190200, "Matrix after fix", matrix(true)],
        ["green", 190300, "All tests and every profile pass", undefined],
        ["approval_requested", 190400, "Waiting for the developer to approve a pull request", undefined],
      ] as [RunEventDoc["type"], number, string, unknown][]
    )
      .slice(0, upTo)
      .map(([type, atMs, summary, data], seq) => ({ runId, at: new Date(), seq, atMs, type, summary, data }));
  const stoppedEvents: RunEventDoc[] = [
    { runId: stopped, at: new Date(), seq: 0, atMs: 12000, type: "understood", summary: "The pickup confirmation shows the day before the reserved date.", data: undefined },
    { runId: stopped, at: new Date(), seq: 1, atMs: 90000, type: "matrix", summary: "Matrix round 1 (3 profiles)", data: [{ name: "reporter", kind: "as reported", env: "en-US · Europe/London · 1536×864", ok: true, failure: null, engines: eng(true) }, { name: "baseline", kind: "neutral", env: "en-GB · UTC", ok: true, failure: null, engines: eng(true) }, { name: "add-dark-mode", kind: "added", change: "dark mode", ok: true, failure: null, engines: eng(true) }] },
    { runId: stopped, at: new Date(), seq: 2, atMs: 120000, type: "stopped", summary: "The replay passes under the reporter's profile and under every extra condition tried, so the bug did not reproduce.", data: undefined },
  ];
  await events.insertMany([...mkEvents(fixed, 99), ...mkEvents(running, 5), ...stoppedEvents]);
  await runs.insertMany([
    {
      _id: fixed, repo: "acme/shop", issueNumber: 12, title: "Category pages empty for some customers", notes: "Samsung Galaxy Z Flip, Chrome on Android, phone language is Turkish", attachments: [{ kind: "image", name: "customer-screenshot.png" }], tokenCap: 600_000, isolatedRows: ["reset-locale"], matrix: matrix(true), status: "fixed", createdAt: new Date(Date.now() - 600_000), finishedAt: new Date(Date.now() - 400_000),
      userLogin: FAKE, tokensUsed: 82_000, decisiveVariables: ["locale"], otherProblems: [{ profile: "add-storage-blocked", problem: "The operation is insecure." }],
      rootCause: { file: "src/categories.js", rootCause: "Locale-sensitive upper-casing turns the ASCII i into a dotted capital I.", explanation: "Under tr-TR, 'fiction'.toLocaleUpperCase(navigator.language) gives 'FİCTİON', which never matches the server's 'FICTION' key." },
      diff: "diff --git a/src/categories.js b/src/categories.js\n--- a/src/categories.js\n+++ b/src/categories.js\n@@ -1,6 +1,5 @@\n // The server stores categories under upper-case keys.\n-// Turn a URL slug into that key, using the visitor's language.\n+// Turn a URL slug into that locale-independent ASCII key.\n export function categoryKey(slug) {\n-  return slug.toLocaleUpperCase(navigator.language);\n+  return slug.toUpperCase();\n }",
      profile: { engine: "chromium", locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 412, height: 1004 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, name: "reporter", notEmulated: ["Real device GPU", "The vendor's browser build", "Real mobile network"] },
      testContent: "// test", fixFiles: [{ path: "src/categories.js", content: "x" }],
    },
    { _id: running, repo: "acme/shop", issueNumber: 13, title: "Shop opens as a blank white page for some visitors", notes: "iPhone, opened from an in-app browser, language English (UK)", status: "running", createdAt: new Date(Date.now() - 88_000), userLogin: FAKE, tokensUsed: 31_000, tokenCap: 600_000 },
    {
      _id: stopped, repo: "acme/shop", issueNumber: 14, title: "Pickup confirmation shows the wrong day", notes: "Chrome on a Windows laptop, language English (US)", status: "not_reproduced", createdAt: new Date(Date.now() - 400_000), finishedAt: new Date(Date.now() - 100_000), userLogin: FAKE, tokensUsed: 85_000, tokenCap: 600_000,
      reason: "The replay passes under the reporter's profile and under every extra condition tried, so the bug did not reproduce.",
      suggestions: ["Where the customer is (city or timezone): the timezone was guessed as Europe/London.", "A screenshot of the confirmation page."],
      profile: { engine: "chromium", locale: "en-US", timezoneId: "Europe/London", viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, isMobile: false, hasTouch: false, name: "reporter", notEmulated: [] },
    },
  ]);
  // A fixed run whose pull request is open, reviewers have commented and a verified revision is waiting for the developer's click.
  const pr = new ObjectId();
  const source = (await runs.findOne({ _id: fixed }))!;
  await events.insertMany(mkEvents(pr, 99).map((e) => ({ ...e, runId: pr })));
  await events.insertOne({ runId: pr, at: new Date(), seq: 99, atMs: 240000, type: "pr_opened", summary: "Pull request #7 opened: https://github.com/acme/shop/pull/7" });
  await events.insertOne({ runId: pr, at: new Date(), seq: 100, atMs: 900000, type: "pr_update", summary: "New review activity on the pull request (#7)" });
  await events.insertOne({ runId: pr, at: new Date(), seq: 101, atMs: 960000, type: "revision", summary: "The revision is verified: the test fails before it and passes after it, 4 of 4 required profiles pass" });
  await runs.insertOne({
    ...source,
    _id: pr,
    issueNumber: 15,
    createdAt: new Date(Date.now() - 20 * 60_000),
    finishedAt: new Date(Date.now() - 15 * 60_000),
    prUrl: "https://github.com/acme/shop/pull/7",
    prNumber: 7,
    prState: "open",
    prReviews: 1,
    prComments: 2,
    prReviewState: "CHANGES_REQUESTED",
    prCheckedAt: new Date(),
    approvedAt: new Date(),
    revisions: 0,
    revision: {
      status: "ready",
      requestedAt: new Date(),
      feedbackCount: 2,
      feedback: "- reviewer: please explain why the locale must not be used",
      summary: "Explain in a comment why locale-aware upper-casing must not be used for category keys.",
      reply: "Thanks for the review! I added a comment above the changed line explaining that toLocaleUpperCase turns i into a dotted capital I in Turkish and Azerbaijani, which breaks lookups against the server's ASCII keys. The test and the other profiles still pass.",
      diff: "diff --git a/src/categories.js b/src/categories.js\n--- a/src/categories.js\n+++ b/src/categories.js\n@@ -1,5 +1,7 @@\n // The server stores categories under ASCII upper-case keys.\n export function categoryKey(slug) {\n-  return slug.toLocaleUpperCase(navigator.language);\n+  // Do not use toLocaleUpperCase: in Turkish and Azerbaijani, i becomes a dotted capital I,\n+  // which does not match the server's ASCII keys.\n+  return slug.toUpperCase();\n }\n",
      matrixPassed: 4,
      matrixTotal: 4,
    },
  });
  await runs.updateOne({ _id: stopped }, { $set: { replyDraft: { text: "Thanks for reporting this. I tried to reproduce it with Chrome on Windows, en-US, in the Europe/London timezone, and also with dark mode, but the confirmation showed the correct day every time.\n\nCould you tell me:\n- Your city or timezone (I guessed Europe/London)\n- A screenshot of the confirmation page" } } });
  return { fixed: String(fixed), running: String(running), stopped: String(stopped), pr: String(pr), ids: [fixed, running, stopped, pr] };
}

async function main() {
  mkdirSync(out, { recursive: true });
  const seeded = await seed();
  const browser = await chromium.launch();
  const cookie = { name: "reproducer_session", value: seal({ login: FAKE, name: "Test User", avatar: "", token: "x", exp: Date.now() + 3600_000 }), url: base };
  const repos = [
    { fullName: "acme/shop", owner: "acme", name: "shop", description: "A small online shop", isPrivate: false, openIssues: 3, updatedAt: null },
    { fullName: "acme/docs", owner: "acme", name: "docs", description: null, isPrivate: false, openIssues: 0, updatedAt: null },
    { fullName: "acme/internal-tools", owner: "acme", name: "internal-tools", description: "Private", isPrivate: true, openIssues: 1, updatedAt: null },
  ];
  const issues = [12, 13, 14].map((n) => ({ number: n, title: ["Category pages empty for some customers", "Shop opens as a blank white page for some visitors", "Pickup confirmation shows the wrong day"][n - 12], body: "A few customers have written in that it does not work for them. I cannot reproduce it on my own machine.", author: "maintainer", createdAt: new Date(Date.now() - n * 3_600_000).toISOString(), comments: 0, url: "https://github.com/acme/shop/issues/" + n }));
  try {
    for (const scheme of ["dark"] as const) {
      for (const [device, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
        const ctx = await browser.newContext({ viewport, colorScheme: scheme });
        await ctx.route("**/api/repos", (r) => r.fulfill({ json: { repos } }));
        await ctx.route("**/api/repos/*/*/issues", (r) => r.fulfill({ json: { issues } }));
        await ctx.route("**/api/warm", (r) => r.fulfill({ json: { state: "warm" } }));
        const shot = async (name: string, url: string) => {
          const page = await ctx.newPage();
          await page.goto(base + url, { waitUntil: "networkidle" });
          await page.waitForTimeout(700);
          await page.screenshot({ path: `${out}/${scheme}-${device}-${name}.png`, fullPage: true });
          await page.close();
        };
        await shot("1-landing", "/"); // logged out
        await ctx.addCookies([cookie]);
        await shot("2-dashboard", "/");
        await shot("3-issues", "/repos/acme/shop");
        await shot("4-ticket", "/repos/acme/shop/issues/13");
        await shot("5-run-fixed", `/runs/${seeded.fixed}`);
        await shot("6-run-running", `/runs/${seeded.running}`);
        await shot("7-run-could-not-reproduce", `/runs/${seeded.stopped}`);
        await shot("12-insights", "/insights");
        await shot("13-run-pr-revision", `/runs/${seeded.pr}`);
        await ctx.close();

        // Loading states: the data requests are held open, so the page shows its skeletons.
        const waiting = await browser.newContext({ viewport, colorScheme: scheme });
        await waiting.addCookies([cookie]);
        await waiting.route(/\/api\/(repos|runs|memory|clusters)/, () => undefined); // never answered
        const wait = async (name: string, url: string) => {
          const page = await waiting.newPage();
          await page.goto(base + url, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${out}/${scheme}-${device}-${name}.png`, fullPage: true });
          await page.close();
        };
        await wait("8-dashboard-loading", "/");
        await wait("9-issues-loading", "/repos/acme/shop");
        await wait("10-ticket-loading", "/repos/acme/shop/issues/13");
        await wait("11-run-loading", `/runs/${seeded.running}`);
        await waiting.close();
      }
    }
    console.log(`Screenshots saved in ${out}/ (desktop and phone: 7 pages and 4 loading states each)`);
  } finally {
    await browser.close();
    await (await collection<RunEventDoc>("run_events")).deleteMany({ runId: { $in: seeded.ids } });
    await (await collection<RunDoc>("runs")).deleteMany({ _id: { $in: seeded.ids } });
    await closeMongo();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
