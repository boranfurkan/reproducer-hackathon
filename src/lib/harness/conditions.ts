// Environment conditions beyond what Playwright's context options give: things only some visitors have. Each one is a small script that
// runs in the page before the app does (an init script) or a rule on the network, and each is used twice from here, so the matrix and the
// generated tests reproduce exactly the same thing:
//   translated  the browser's page translation (Chrome Translate, Edge, Safari) rewrote the text of the page
//   adBlock     a content blocker (uBlock Origin, AdGuard, Brave shields) blocks trackers and hides ad-like elements
//   removeApis  an older browser that does not have some newer APIs (older iOS Safari, older Android WebView)
//   latencyMs   a slow connection: every request that is not the page itself waits this long

/** APIs a profile may remove, to emulate an older browser. The model picks from this list; anything else is ignored. */
export const REMOVABLE_APIS = [
  "crypto.randomUUID",
  "structuredClone",
  "Array.prototype.at",
  "Array.prototype.findLast",
  "Object.hasOwn",
  "String.prototype.replaceAll",
  "Promise.withResolvers",
  "Intl.Segmenter",
  "ResizeObserver",
  "navigator.clipboard",
  "navigator.share",
] as const;

/**
 * What the browser's own translation does to a page: every text node is replaced by <font><font>text</font></font>, and text that the page
 * adds later is replaced the same way. The page's framework still holds the original text nodes, which are no longer in the document:
 * removing one throws NotFoundError, updating one silently changes nothing. Like the real thing, it leaves text inside translate="no" or .notranslate alone.
 */
export const TRANSLATE_SCRIPT = `(() => {
  const wrap = (node) => {
    const text = node.nodeValue;
    const parent = node.parentNode;
    if (!text || !text.trim() || !parent || ['SCRIPT', 'STYLE', 'FONT'].includes(parent.nodeName)) return;
    if (parent.closest && parent.closest('[translate="no"], .notranslate')) return;
    const outer = document.createElement('font');
    outer.style.verticalAlign = 'inherit';
    const inner = document.createElement('font');
    inner.style.verticalAlign = 'inherit';
    inner.textContent = text;
    outer.appendChild(inner);
    parent.replaceChild(outer, node);
  };
  const walk = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(wrap);
  };
  const start = () => {
    walk(document.body);
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) { if (n.nodeType === 3) wrap(n); else if (n.nodeType === 1) walk(n); }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();`;

/** Requests a content blocker refuses (patterns in the spirit of EasyList and EasyPrivacy: analytics and tracker scripts, ad networks, ad paths). */
export const ADBLOCK_URL_PATTERN =
  "(^|/)(analytics|tracker|tracking|beacon|pixel|gtag|gtm|hotjar|mixpanel|fbevents)[^/]*\\.js(\\?|$)|googletagmanager\\.com|google-analytics\\.com|doubleclick\\.net|/ads?/|/banners?/";

/** Elements a content blocker hides (cosmetic filters for ad-like class names). */
export const ADBLOCK_CSS = ".ad, .ads, .advert, .ad-banner, .adsbygoogle, .sponsored, [id^='ad-'], [class*='sponsor-']{display:none !important}";

// An init script runs before the document exists, so the cosmetic rules are added once it does.
export const adBlockInitScript = `(() => { const add = () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(ADBLOCK_CSS)}; (document.head || document.documentElement).appendChild(s); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); })();`;

/** Deletes the given APIs before the page runs. Walks up the prototype chain to the object that owns the property. */
export function removeApisScript(paths: string[]): string {
  const safe = paths.filter((p) => (REMOVABLE_APIS as readonly string[]).includes(p));
  return `(() => { for (const path of ${JSON.stringify(safe)}) { const parts = path.split('.'); const key = parts.pop(); let o = window; for (const p of parts) o = o && o[p]; while (o && !Object.prototype.hasOwnProperty.call(o, key)) o = Object.getPrototypeOf(o); if (o) { try { delete o[key]; } catch (e) {} if (o[key] !== undefined) Object.defineProperty(o, key, { value: undefined, configurable: true }); } } })();`;
}

/** The profile's conditions as one record, for the matrix runner (which embeds this and applies it to each context). */
export const MATRIX_CONDITIONS = {
  translate: TRANSLATE_SCRIPT,
  adBlockPattern: ADBLOCK_URL_PATTERN,
  adBlockInit: adBlockInitScript,
};

interface ConditionFlags {
  translated?: boolean;
  adBlock?: boolean;
  removeApis?: string[];
  latencyMs?: number;
}

/**
 * The code for a generated Playwright test: a `test.beforeEach` hook that reproduces the profile's conditions, or "" when it has none.
 * The model is told to include it verbatim inside the describe block of the failing environment.
 */
export function conditionHook(p: ConditionFlags): string {
  const lines: string[] = [];
  if (p.translated) lines.push(`await context.addInitScript(${JSON.stringify(TRANSLATE_SCRIPT)});`);
  if (p.adBlock) {
    lines.push(`await context.addInitScript(${JSON.stringify(adBlockInitScript)});`);
    lines.push(`await context.route('**/*', (route) => (new RegExp(${JSON.stringify(ADBLOCK_URL_PATTERN)}, 'i').test(route.request().url()) ? route.abort('blockedbyclient') : route.continue()));`);
  }
  if (p.removeApis?.length) lines.push(`await context.addInitScript(${JSON.stringify(removeApisScript(p.removeApis))});`);
  if (p.latencyMs) lines.push(`await context.route('**/*', async (route) => { if (route.request().resourceType() !== 'document') await new Promise((r) => setTimeout(r, ${Math.round(p.latencyMs)})); await route.continue(); });`);
  return lines.length ? `test.beforeEach(async ({ context }) => { ${lines.join(" ")} });` : "";
}

/** The sandbox applies a profile's removed APIs from a ready-made script (the list of removable APIs lives here, not there). */
export const withInitScripts = <T extends { removeApis?: string[] }>(p: T): T & { removeApisScript?: string } =>
  p.removeApis?.length ? { ...p, removeApisScript: removeApisScript(p.removeApis) } : p;
