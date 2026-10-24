// Screenshots of every page, light and dark, desktop and phone width, with fake data, for reviewing a redesign.
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

const matrix = (ok: boolean) => [
  { name: "reporter", ok, failure: ok ? null : 'expect_count_min [data-testid="book-card"]: count stayed below 1', errors: [] as string[], pageText: "" },
  { name: "baseline", ok: true, failure: null, errors: [] as string[], pageText: "" },
  { name: "reset-locale", ok: true, failure: null, errors: [] as string[], pageText: "" },
  { name: "reset-timezone", ok, failure: ok ? null : "expect_count_min: count stayed below 1", errors: [] as string[], pageText: "" },
  { name: "add-storage-blocked", ok: false, failure: "expect_visible: timeout", errors: ["The operation is insecure."], pageText: "" },
];

async function seed() {
  const { ObjectId } = await import("mongodb");
  const runs = await collection<RunDoc>("runs");
  const events = await collection<RunEventDoc>("run_events");
  const fixed = new ObjectId();
  const running = new ObjectId();
  const mkEvents = (runId: InstanceType<typeof ObjectId>, upTo: number): RunEventDoc[] =>
    (
      [
        ["boot", 4000, "Sandbox ready", undefined],
        ["understood", 14000, "Customers in Turkey using Chrome on an Android phone see an empty category page.", { mediaObservations: "The user opens the shop, taps Fiction and sees \"No books in this category yet\"." }],
        ["profile", 14500, "chromium, tr-TR, Europe/Istanbul, 412x1004, touch", { engine: "chromium" }],
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
  await events.insertMany([...mkEvents(fixed, 99), ...mkEvents(running, 5)]);
  await runs.insertMany([
    {
      _id: fixed, repo: "acme/shop", issueNumber: 12, title: "Category pages empty for some customers", notes: "", status: "fixed", createdAt: new Date(Date.now() - 600_000), finishedAt: new Date(Date.now() - 400_000),
      userLogin: FAKE, tokensUsed: 82_000, decisiveVariables: ["locale"], otherProblems: [{ profile: "add-storage-blocked", problem: "The operation is insecure." }],
      rootCause: { file: "src/categories.js", rootCause: "Locale-sensitive upper-casing turns the ASCII i into a dotted capital I.", explanation: "Under tr-TR, 'fiction'.toLocaleUpperCase(navigator.language) gives 'FİCTİON', which never matches the server's 'FICTION' key." },
      diff: "diff --git a/src/categories.js b/src/categories.js\n--- a/src/categories.js\n+++ b/src/categories.js\n@@ -1,6 +1,5 @@\n // The server stores categories under upper-case keys.\n-// Turn a URL slug into that key, using the visitor's language.\n+// Turn a URL slug into that locale-independent ASCII key.\n export function categoryKey(slug) {\n-  return slug.toLocaleUpperCase(navigator.language);\n+  return slug.toUpperCase();\n }",
      profile: { engine: "chromium", locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 412, height: 1004 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, name: "reporter", notEmulated: ["Real device GPU", "The vendor's browser build", "Real mobile network"] },
      testContent: "// test", fixFiles: [{ path: "src/categories.js", content: "x" }],
    },
    { _id: running, repo: "acme/shop", issueNumber: 13, title: "Shop opens as a blank white page for some visitors", notes: "", status: "running", createdAt: new Date(), userLogin: FAKE },
  ]);
  return { fixed: String(fixed), running: String(running), ids: [fixed, running] };
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
    for (const scheme of ["light", "dark"] as const) {
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
        await ctx.close();
      }
    }
    console.log(`Screenshots saved in ${out}/ (light and dark, desktop and phone, 6 pages each)`);
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
