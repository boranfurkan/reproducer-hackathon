// Scripts that run inside the sandbox. They are written by the orchestrator, never by the model.
// Everything heavy lives under /opt: every byte under /workspace adds time to EVERY sandbox call (about 40 ms per MB),
// while /opt costs nothing. The price is that /opt is wiped after 15 idle minutes, so keep the environment warm.
import type { SandboxFile } from "../types";
import { MATRIX_CONDITIONS } from "./conditions";

const MATRIX_JS = String.raw`const pw = require("playwright");
const fs = require("fs");
const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
// The sandbox's WebKit renders at about 4 frames a second, and Playwright's click checks need frames: generous step timeouts, and at
// most a few pages at a time per browser.
const T = 6000;
const PARALLEL = 4;
// Conditions shared with the generated tests (src/lib/harness/conditions.ts).
const CONDITIONS = ${JSON.stringify(MATRIX_CONDITIONS)};

async function runStep(page, s) {
  switch (s.action) {
    case "goto": return page.goto(job.baseUrl + (s.url || "/"));
    case "click": return page.locator(s.selector).first().click({ timeout: T });
    case "fill": return page.locator(s.selector).first().fill(s.value || "", { timeout: T });
    case "press": return page.keyboard.press(s.key);
    case "wait": return page.waitForTimeout(Math.min(s.ms || 500, 3000));
    case "expect_visible": return page.locator(s.selector).first().waitFor({ state: "visible", timeout: T });
    case "expect_hidden": return page.locator(s.selector).first().waitFor({ state: "hidden", timeout: T });
    case "expect_text": {
      const rx = /^\/(.*)\/([a-z]*)$/.exec(s.text || "");
      return page.locator(s.selector || "body").filter({ hasText: rx ? new RegExp(rx[1], rx[2]) : s.text }).first().waitFor({ state: "visible", timeout: T });
    }
    case "expect_count_min": {
      // The expected count belongs in min; a model sometimes puts it in value, which must not silently become "at least 1".
      const min = s.min || Number(s.value) || 1;
      const end = Date.now() + T;
      let n = 0;
      while (Date.now() < end) { n = await page.locator(s.selector).count(); if (n >= min) return; await page.waitForTimeout(150); }
      throw new Error("count of " + s.selector + " stayed at " + n + ", below " + min);
    }
    default: throw new Error("unknown action " + s.action);
  }
}

async function runProfile(browser, p) {
  let ctx;
  try {
    const o = { locale: p.locale, timezoneId: p.timezoneId, viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, hasTouch: p.hasTouch, colorScheme: p.colorScheme || "light" };
    if (p.engine !== "firefox") o.isMobile = p.isMobile;
    if (p.userAgent) o.userAgent = p.userAgent;
    if (p.reducedMotion) o.reducedMotion = "reduce";
    ctx = await browser.newContext(o);
    // Conditions beyond the context options: what only some visitors have (translation, a content blocker, an older browser, a slow connection).
    if (p.translated) await ctx.addInitScript(CONDITIONS.translate);
    if (p.adBlock) {
      await ctx.addInitScript(CONDITIONS.adBlockInit);
      const blocked = new RegExp(CONDITIONS.adBlockPattern, "i");
      await ctx.route("**/*", (route) => (blocked.test(route.request().url()) ? route.abort("blockedbyclient") : route.continue()));
    }
    if (p.removeApisScript) await ctx.addInitScript(p.removeApisScript);
    if (p.latencyMs) await ctx.route("**/*", async (route) => { if (route.request().resourceType() !== "document") await new Promise((r) => setTimeout(r, p.latencyMs)); await route.continue(); });
    if (p.storageBlocked) {
      await ctx.addInitScript(() => {
        const thrower = () => { throw new DOMException("The operation is insecure.", "SecurityError"); };
        Object.defineProperty(window, "localStorage", { get: thrower });
        Object.defineProperty(window, "sessionStorage", { get: thrower });
      });
    }
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    let failure = null;
    for (const s of job.plan.steps) {
      try { await runStep(page, s); } catch (e) { failure = s.action + " " + (s.selector || s.url || "") + ": " + String(e.message).split("\n")[0].slice(0, 140); break; }
    }
    const text = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
    // An experiment can measure something in the page after the steps (whether they failed or not): a JavaScript expression, may be async.
    let probe;
    if (job.probe) {
      probe = await page
        .evaluate("(async () => { try { const v = await (" + job.probe + "); return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return 'probe error: ' + e.message; } })()")
        .catch((e) => "probe error: " + String(e.message).split("\n")[0]);
      probe = String(probe).slice(0, 700);
    }
    return { name: p.name, ok: !failure, failure, pageText: text, errors: errors.slice(0, 2), ...(job.probe ? { probe } : {}) };
  } catch (e) {
    return { name: p.name, ok: false, failure: "harness: " + String(e.message).split("\n")[0].slice(0, 140) };
  } finally { if (ctx) await ctx.close().catch(() => {}); }
}

// One browser per engine, one context per profile. Every profile is replayed in every installed engine (the matrix table has a column per
// engine); the result that counts is the one for the profile's own engine, the other engines are extra information.
(async () => {
  const engines = job.engines && job.engines.length ? job.engines : [...new Set(job.profiles.map((p) => p.engine))];
  const browsers = {};
  const skipped = [];
  // An engine that cannot launch (not installed) skips its profiles instead of crashing the whole matrix.
  for (const e of engines) {
    try { browsers[e] = await pw[e].launch(); } catch (err) { skipped.push(e + ": " + String(err.message).split("\n")[0].slice(0, 100)); }
  }
  const launched = Object.keys(browsers);
  const work = [];
  for (const p of job.profiles) {
    const own = launched.includes(p.engine) ? p.engine : launched[0];
    for (const e of launched) work.push({ p, e, own });
  }
  // A small pool per engine: every engine runs at most PARALLEL pages at once.
  const done = [];
  await Promise.all(launched.map(async (engine) => {
    const queue = work.filter((w) => w.e === engine);
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      for (let w = queue.shift(); w; w = queue.shift()) {
        const r = await runProfile(browsers[engine], { ...w.p, engine });
        done.push({ name: w.p.name, engine, primary: engine === w.own, r });
      }
    }));
  }));
  const results = job.profiles.filter((p) => done.some((d) => d.name === p.name)).map((p) => {
    const mine = done.filter((d) => d.name === p.name);
    const main = mine.find((d) => d.primary).r;
    const byEngine = {};
    for (const d of mine) byEngine[d.engine] = { ok: d.r.ok, failure: d.r.failure };
    return { ...main, name: p.name, engines: byEngine };
  });
  await Promise.all(Object.values(browsers).map((b) => b.close()));
  console.log("@@RESULT@@" + JSON.stringify(results) + "@@END@@");
  if (skipped.length) console.log("@@SKIPPED@@" + JSON.stringify(skipped) + "@@END@@");
})();
`;

const MATRIX_SH = `#!/bin/bash
# The sandbox presets NODE_OPTIONS=--require global-agent/bootstrap and a NODE_PATH for it: append, never replace.
export NODE_PATH=/opt/pw/node_modules:$NODE_PATH PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
bash /opt/harness/wait-deps.sh
cd /opt/target
npm run build >/opt/build.log 2>&1 || true
PORT=3100 node server/index.js >/opt/server.log 2>&1 &
SRV=$!
for i in $(seq 1 40); do curl -sf http://localhost:3100/ >/dev/null && break; sleep 0.25; done
node /opt/harness/matrix.js /opt/harness/job.json
kill $SRV 2>/dev/null
`;

const TEST_SH = `#!/bin/bash
export PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
bash /opt/harness/wait-deps.sh
cd /opt/target
npx playwright test "$@" --reporter=line 2>&1 | tail -14
exit \${PIPESTATUS[0]}
`;

// WebKit needs system libraries (an apt install, about 45 s); Chromium does not (measured: Chromium launches without them). So boot does not
// wait for the libraries: it starts their installation in the background and returns when Chromium, the clone and the dependencies are ready
// (about 30 s instead of 105 s). Anything that launches a browser calls wait-deps.sh first, which returns at once when they are installed.
const WAIT_DEPS_SH = `#!/bin/bash
for i in $(seq 1 120); do
  [ -f /opt/.webkit-deps ] && exit 0
  [ -f /opt/.webkit-deps-running ] || exit 0
  sleep 1
done
`;

const BOOT_SH = `#!/bin/bash
set -e
URL="$1"
rm -rf /opt/stage
export PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
# Playwright and its browsers live in /opt (fast calls). They are wiped when the environment idles for 15 minutes.
if [ ! -d /opt/pw/node_modules/playwright ] || [ "$(ls /opt/browsers 2>/dev/null | grep -c -E 'chromium|webkit')" -lt 2 ]; then
  mkdir -p /opt/pw && cd /opt/pw
  npm init -y >/dev/null 2>&1
  npm i playwright >/opt/pw-install.log 2>&1
  npx playwright install chromium webkit >>/opt/pw-install.log 2>&1
  rm -f /opt/.webkit-deps
  echo PW_INSTALLED
fi
if [ ! -f /opt/.webkit-deps ] && [ ! -f /opt/.webkit-deps-running ]; then
  touch /opt/.webkit-deps-running
  nohup setsid bash -c 'cd /opt/pw && npx playwright install-deps chromium webkit >/opt/pw-deps.log 2>&1; touch /opt/.webkit-deps; rm -f /opt/.webkit-deps-running' >/dev/null 2>&1 &
fi
if [ -d /opt/target/.git ] && [ "$(git -C /opt/target remote get-url origin)" = "$URL" ]; then
  # Warm environment: reset to the latest commit and keep node_modules (ignored files survive git clean).
  cd /opt/target
  git fetch --depth 1 origin >/dev/null 2>&1
  git reset --hard FETCH_HEAD >/dev/null 2>&1
  git clean -fd >/dev/null 2>&1
else
  rm -rf /opt/target /opt/.lockhash
  git clone --depth 1 "$URL" /opt/target >/dev/null 2>&1
  cd /opt/target
fi
LOCK=$(md5sum package-lock.json | cut -d' ' -f1)
if [ "$LOCK" != "$(cat /opt/.lockhash 2>/dev/null)" ] || [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/opt/npm.log 2>&1
  echo "$LOCK" > /opt/.lockhash
  echo NPM_INSTALLED
fi
echo BOOT_OK
`;

export const HARNESS_DIR = "/opt/harness";
export const TARGET_DIR = "/opt/target";

export const harnessFiles = (): SandboxFile[] => [
  { path: `${HARNESS_DIR}/matrix.js`, content: MATRIX_JS },
  { path: `${HARNESS_DIR}/matrix.sh`, content: MATRIX_SH },
  { path: `${HARNESS_DIR}/test.sh`, content: TEST_SH },
  { path: `${HARNESS_DIR}/boot.sh`, content: BOOT_SH },
  { path: `${HARNESS_DIR}/wait-deps.sh`, content: WAIT_DEPS_SH },
];
