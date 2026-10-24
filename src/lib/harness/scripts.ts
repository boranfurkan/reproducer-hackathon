// Scripts that run inside the sandbox. They are written by the orchestrator, never by the model.
// Everything heavy lives under /opt: every byte under /workspace adds time to EVERY sandbox call (about 40 ms per MB),
// while /opt costs nothing. The price is that /opt is wiped after 15 idle minutes, so keep the environment warm.
import type { SandboxFile } from "../types";

const MATRIX_JS = String.raw`const pw = require("playwright");
const fs = require("fs");
const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const T = 3500;

async function runStep(page, s) {
  switch (s.action) {
    case "goto": return page.goto(job.baseUrl + (s.url || "/"));
    case "click": return page.locator(s.selector).first().click({ timeout: T });
    case "fill": return page.locator(s.selector).first().fill(s.value || "", { timeout: T });
    case "press": return page.keyboard.press(s.key);
    case "wait": return page.waitForTimeout(Math.min(s.ms || 500, 3000));
    case "expect_visible": return page.locator(s.selector).first().waitFor({ state: "visible", timeout: T });
    case "expect_text": {
      const rx = /^\/(.*)\/([a-z]*)$/.exec(s.text || "");
      return page.locator(s.selector || "body").filter({ hasText: rx ? new RegExp(rx[1], rx[2]) : s.text }).first().waitFor({ state: "visible", timeout: T });
    }
    case "expect_count_min": {
      const end = Date.now() + T;
      while (Date.now() < end) { if ((await page.locator(s.selector).count()) >= (s.min || 1)) return; await page.waitForTimeout(150); }
      throw new Error("count of " + s.selector + " stayed below " + (s.min || 1));
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
    const text = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
    return { name: p.name, ok: !failure, failure, pageText: text, errors: errors.slice(0, 2) };
  } catch (e) {
    return { name: p.name, ok: false, failure: "harness: " + String(e.message).split("\n")[0].slice(0, 140) };
  } finally { if (ctx) await ctx.close().catch(() => {}); }
}

// One browser per engine, one context per profile: lighter than a browser per profile, so the matrix can be wider.
(async () => {
  const engines = [...new Set(job.profiles.map((p) => p.engine))];
  const browsers = {};
  for (const e of engines) browsers[e] = await pw[e].launch();
  const results = await Promise.all(job.profiles.map((p) => runProfile(browsers[p.engine], p)));
  await Promise.all(Object.values(browsers).map((b) => b.close()));
  console.log("@@RESULT@@" + JSON.stringify(results) + "@@END@@");
})();
`;

const MATRIX_SH = `#!/bin/bash
# The sandbox presets NODE_OPTIONS=--require global-agent/bootstrap and a NODE_PATH for it: append, never replace.
export NODE_PATH=/opt/pw/node_modules:$NODE_PATH PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
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
cd /opt/target
npx playwright test "$@" --reporter=line 2>&1 | tail -14
exit \${PIPESTATUS[0]}
`;

const BOOT_SH = `#!/bin/bash
set -e
URL="$1"
export PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
# Playwright and its browsers live in /opt (fast calls). They are wiped when the environment idles for 15 minutes.
if [ ! -d /opt/pw/node_modules/playwright ] || [ "$(ls /opt/browsers 2>/dev/null | grep -c -E 'chromium|webkit')" -lt 2 ]; then
  mkdir -p /opt/pw && cd /opt/pw
  npm init -y >/dev/null 2>&1
  npm i playwright >/opt/pw-install.log 2>&1
  npx playwright install --with-deps chromium webkit >>/opt/pw-install.log 2>&1
  echo PW_INSTALLED
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
];
