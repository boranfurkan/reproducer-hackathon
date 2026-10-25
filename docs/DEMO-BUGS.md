# Demo bugs

The demo target is [`boranfurkan/reproducer-hackathon-demo`](https://github.com/boranfurkan/reproducer-hackathon-demo): Pagefold Books, a small online bookshop split into five apps in five stacks (React 18.2, Vue 3.4, plain JavaScript, Preact 10, Alpine.js 3.13). Framework files are vendored at pinned versions in `vendor/`; there is no build step (`npm start` serves everything, `npm test` runs Playwright).

Each bug is one that **code review does not find**: the code looks correct, and the cause is something only some visitors have. Each was proven with plain Playwright before the agent saw it: it fails only under its own condition, in both Chromium and WebKit, and the repository's own tests pass in a normal environment. The retired first set (Turkish casing, blocked storage, timezone day shift, search casing) were plain coding mistakes and are closed.

| Issue | App (stack) | What customers see | Real cause | What it takes to find |
|---|---|---|---|---|
| #8 | Storefront (React 18.2) | The whole page turns white after removing books from the basket; only customers from Germany | Chrome translates the English shop for German visitors: it replaces every text node with `<font>` elements. `CartSummary` renders the basket summary as a bare text node next to a button; when the basket empties React removes that text node, which is no longer in the document, and `removeChild` throws `NotFoundError`. React 18 unmounts the whole tree. | Thinking of page translation from "customers in Germany" on an English site, reproducing it, reading React's commit path in the vendored `react-dom` source. Fix: wrap the text in an element, or mark the summary `translate="no"`. |
| #9 | Account (Vue 3.4) | After closing an order, nothing on the page responds | A later accessibility commit added `@media (prefers-reduced-motion: reduce) { * { transition: none !important } }` to the shared theme. The drawer waits for `transitionend` before it removes itself; with no transition that event never fires, so the invisible backdrop stays on top and swallows every click. | Connecting "accessibility settings because motion makes her dizzy" with reduced motion, probing the computed transition duration (0s), finding the commit in the git history. Fix: finish immediately when the duration is 0 (or a timeout fallback). |
| #10 | Checkout (plain JS) | Pay now does nothing for some customers; no request reaches the server | `/static/js/analytics.js` is blocked by content blockers (its name matches EasyPrivacy-style rules). The submit handler calls `Analytics.identify(...)` before placing the order, so it throws `ReferenceError` and the order is never sent. | Thinking of extensions from "careful about privacy", reproducing with a content blocker, reading the handler. Fix: guard the analytics calls (or a no-op stub). |
| #11 | Events (Preact) | One of the six marathon sessions is missing for some customers | The marathon runs through the night of 24 to 25 October, when UK clocks go back. Sessions are grouped by their local time label, and in Europe/London both 00:00 UTC and 01:00 UTC are "01:00", so one session disappears. Visitors in zones without a change that night see all six. | Knowing when the UK changes clocks, reproducing with the reporters' timezone, finding the grouping in `lib/timeutil.js`. Fix: key sessions by instant and show the offset (BST/GMT). |
| #12 | Reader (Alpine.js) | The reading list page is blank on one customer's phone | The vendored helper `tiny-ids` uses `crypto.randomUUID`, `Array.prototype.at` and `structuredClone`, which Safari only has since 15.4. On an iPhone that was never updated past iOS 14 the component throws while it is created and Alpine renders nothing. | Treating "iPhone she hasn't updated in years" as an older engine, reproducing with those APIs removed in WebKit. Fix: fallbacks in the helper. |

## Notes to type on the ticket form

What the developer knows about the reporter (the agent rebuilds the environment from this):

| Issue | Notes |
|---|---|
| #8 | Customer in Munich, Chrome on Windows 11, German is her language. |
| #9 | MacBook Air, Safari. She told me she changed some accessibility settings on her Mac a while ago because things moving on screen make her dizzy. |
| #10 | Chrome on a Windows work laptop. He says he is careful about privacy and has a few browser extensions. |
| #11 | The customers who wrote are in Edinburgh and Manchester. Our agency is in Istanbul and my laptop clock is set to UTC. |
| #12 | iPhone 8, she hasn't updated it in years, Safari. |

## Environment conditions the agent can use

Beyond Playwright's context options (engine, locale, timezone, viewport, touch, colour scheme, reduced motion): `translated` (the browser's page translation), `adBlock` (a content blocker: tracker and analytics scripts blocked, ad-like elements hidden), `removeApis` (an older browser without listed APIs), `storageBlocked`, `latencyMs`. They are implemented once in `src/lib/harness/conditions.ts` and used by the matrix, the deep investigation's experiments and the generated tests.
