import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { ADBLOCK_URL_PATTERN, REMOVABLE_APIS, conditionHook, removeApisScript } from "./conditions";

test("removed APIs are deleted from the object that owns them, and only listed APIs can be removed", () => {
  class Crypto {
    randomUUID() {
      return "x";
    }
  }
  const win: Record<string, unknown> = { crypto: new Crypto(), structuredClone: () => 1, secret: () => 2 };
  win.window = win;
  runInNewContext(removeApisScript(["crypto.randomUUID", "structuredClone", "secret"]), win);
  assert.equal((win.crypto as Crypto).randomUUID, undefined);
  assert.equal(win.structuredClone, undefined);
  assert.equal(typeof win.secret, "function", "an API that is not in the list is left alone");
  assert.ok(REMOVABLE_APIS.includes("crypto.randomUUID"));
});

test("the content blocker pattern blocks trackers and ad paths, not the shop's own scripts", () => {
  const blocked = new RegExp(ADBLOCK_URL_PATTERN, "i");
  for (const url of ["http://shop.test/static/js/analytics.js", "https://www.googletagmanager.com/gtag/js?id=G-1", "http://shop.test/ads/banner.png", "https://x.test/tracker.min.js?v=2"]) assert.ok(blocked.test(url), url);
  for (const url of ["http://shop.test/apps/checkout/main.js", "http://shop.test/vendor/react@18.2.0/react.development.js", "http://shop.test/api/orders"]) assert.ok(!blocked.test(url), url);
});

test("a generated test gets one hook that reproduces every condition of the failing profile", () => {
  assert.equal(conditionHook({}), "");
  const hook = conditionHook({ translated: true, adBlock: true, removeApis: ["Array.prototype.at"], latencyMs: 400 });
  assert.match(hook, /^test\.beforeEach\(async \(\{ context \}\) => \{ /);
  assert.match(hook, /addInitScript/);
  assert.match(hook, /blockedbyclient/);
  assert.match(hook, /400/);
  assert.ok(!hook.includes("\n"), "the hook is one line so the model can copy it exactly");
});
