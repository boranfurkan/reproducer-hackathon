# Demo bugs

The target app is `reproducer-hackathon-demo` ("Pagefold Books"). It holds three bugs, each visible only in a specific environment. This file lives in the app repo on purpose: the agent reads the demo repo's code and README, so nothing in that repo may describe the bugs.

State on 24 Oct (evening): bug 1 is pushed with issue #1 and tagged `v0-buggy`. Bugs 2 and 3 are written and verified locally in the demo repo's working tree but **not committed or pushed**, and their issues are **not created**. They need the owner's approval.

## Bug 1: category pages empty for Turkish users (pushed, issue #1)

- Code: `src/categories.js`, `slug.toLocaleUpperCase(navigator.language)` turns `fiction` into `FİCTİON` under a Turkish locale, so the API key never matches.
- Ticket: "Category pages empty for some customers" (customers in Turkey, Chrome on a phone, Turkish language).
- Notes to enter: `Samsung Galaxy Z Flip, Chrome on Android, phone language is Turkish, customer is in Istanbul`.
- Matrix: the reporter profile fails; resetting the locale makes it pass.
- Fix: `slug.toUpperCase()`.

## Bug 2: blank page when storage is blocked (local only)

- Code: `src/prefs.js` reads `localStorage` when the module loads, and `src/format.js` imports it, so the whole app fails to start. React never renders, the page is blank, and nothing reaches the server logs. The error is `SecurityError: The operation is insecure` in the browser console.
- Who is affected: visitors whose browser blocks storage (strict cookie blocking, some in-app browsers, privacy modes).
- Suggested issue (create it only after approval):
  - Title: `Shop opens as a blank white page for some visitors`
  - Body: `A few customers have written in that the shop opens as a completely white page. It is two or three reports a week and I have never seen it myself. Most of them say they tapped a link from Instagram or Facebook. Nothing in the server logs, and it works fine on my own iPhone.`
- Notes to enter: `iPhone, opened from an in-app browser, language English (UK)`. Storage is deliberately not mentioned.
- Matrix: the reporter profile and baseline pass. Only the extra condition "storage blocked" fails, with an empty page and the console error. This is what the stressors exist for.
- Fix: read preferences defensively (try/catch around storage access, fall back to defaults) and make `savePrefs` tolerate failure.

## Bug 3: pickup confirmation shows the previous day west of UTC (local only)

- Code: `src/format.js` `formatDay` calls `new Date("2026-11-05")`, which is midnight UTC, and prints it in the visitor's timezone. The reservation API stores the right plain date, only the confirmation is wrong.
- Who is affected: visitors in timezones behind UTC (the Americas). London, Europe and Asia look correct, which is why it is hard to see from a developer machine.
- Suggested issue (create it only after approval):
  - Title: `Pickup confirmation shows the wrong day for a customer`
  - Body: `A customer over in the States reserved a book for pickup on 5 November. The confirmation said it would be waiting on 4 November, so she came in a day early and it was not ready. The reservation itself is correct in our system and it looks right for everyone in the office.`
- Notes to enter: `Chrome on a Windows laptop, language English (US)`. The timezone is deliberately not given.
- Matrix: the reporter profile may pass depending on the timezone guessed. A timezone stressor such as `America/Los_Angeles` fails. London, Auckland and other locales pass.
- Fix: parse the plain date as a local date (for example `new Date(y, m - 1, d)`) or format it with `timeZone: "UTC"`.

## Verified locally (24 Oct)

Using the real matrix harness against the demo shop on a local server:

| Bug | Profile | Result |
|---|---|---|
| 2 | iPhone-like WebKit profile | pass |
| 2 | same profile with storage blocked | **fail**, empty page, `The operation is insecure` |
| 2 | same profile with locale tr-TR | pass |
| 3 | iPhone-like profile, Europe/London | pass |
| 3 | baseline | pass |
| 3 | same profile, America/Los_Angeles | **fail** |
| 3 | same profile, Pacific/Auckland or en-US locale | pass |

The demo repo's Playwright suite (4 tests) passes in the default environment.

## Bug 4: search finds nothing for Turkish customers (pushed, issue #4)

A deliberate cousin of bug 1, so that the memory has something to recall.

- Code: `src/search.js` lower-cases the query and the titles with `toLocaleLowerCase(navigator.language)`. In Turkish and Azerbaijani a capital `I` becomes a dotless `ı`, so typing `SILK ROAD` searches for `sılk road` and finds nothing.
- Issue #4: "Search shows no results for some customers" (a customer in Turkey, she types titles in capitals).
- Notes to enter: `Chrome on a Windows laptop, language Turkish`.
- Matrix: the Turkish profile fails, so does Azerbaijani; English and German pass (verified locally with the harness, Chromium and WebKit).
- Fix: compare with a locale-independent lower-casing (`toLowerCase()`) or `localeCompare` with an explicit locale.
- Demo use: run issue #1 first (its fix is stored in memory), then #4. The timeline should show "Seen something similar before: Category pages empty for some customers".
- Tag `v2-four-bugs` marks the repo with all four bugs.

## Results of the agent on these bugs (24 Oct, new key, cold then warm sandbox)

| Issue | Reporter profile | What found it | Result |
|---|---|---|---|
| 1 Turkish i | tr-TR Android phone | reporter fails; resetting locale fixes | fixed (earlier runs: about 190 s warm) |
| 2 blank page | iPhone in-app browser, en-GB | **reporter passes**; the stressor "storage blocked" fails with `The operation is insecure` | fixed in 302 s cold, about 100k tokens; try/catch around `localStorage` in `src/prefs.js` |
| 3 wrong day | Windows laptop en-US; Argon chose a US timezone | reporter fails; resetting the timezone fixes | fixed in about 4 min warm, about 94k tokens; formats the plain date without the UTC shift |

Note: the diff recorded for run 3 (and likely run 1 of that batch) was contaminated by a stale staging directory (D-23, fixed afterwards); rerun them for clean results.

## Before the demo

- Push the bugs, create the issues, tag the full set (suggested `v1-all-bugs`) and reset to that tag before every demo run.
- Do not merge fix PRs until a reset is possible.
