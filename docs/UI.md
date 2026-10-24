# UI

The interface follows the redesign of 24 October 2026 (made with an external design tool) (dark theme, a pixel-art detective-beetle mascot called Loupe). This file is the contract for changing it again: a new look touches **only** `src/components/`, `src/styles/globals.css` and the page wrappers in `src/app/**/page.tsx`. All data and actions come from `src/lib/hooks.ts`; the HTTP shapes are typed in `src/lib/client.ts`. Do not call `fetch` or `api()` from a component.

The design source (HTML components, mascot script and brief) was delivered as a folder outside the repository (`repoducer-redesign`); it also contains third-party reference pages that must not be committed. Everything the app needs from it (tokens, the mascot art and animations, the layouts) has been ported into the files below.

## Design language

- **Tokens** (`src/styles/globals.css`, Tailwind v4 `@theme`): purple scale `purple-950` page `#09051c`, `900` card `#120a2e`, `850` raised `#1d0245`, `800` line `#2a1a52`, `700` line-strong `#44307e`, `500`, `400`, `200` accent `#d0b9ff`; wells `ink` `#0d0724` and `code` `#07041a`; text `foreground` `#f3eeff`, `muted` `#c3b5e8`, `subtle` `#9a8bc8`, `faint` `#6f619c`; signals `hot` `#ff79c6` (keywords, highlight), `pass` `#74e8b0`, `fail` `#ff8a80`, `amber` `#ffc857` (waiting), `cyan` `#7fe3f0` (running). Radii 6 / 8 / 12 px. Dark only (`color-scheme: dark`).
- **Type**: Roboto Mono for chrome and headings (`font-mono`), Geist for reading (`font-sans`), base 15 px. Both load through `next/font` in `src/app/layout.tsx`.
- **Rules**: decoration lives in the margins; diffs, test output and the matrix stay plain and high contrast. Focus ring is pink (`:focus-visible`). Reduced motion gives static poses and no wandering.

## The mascot (`src/components/mascot/`)

- `pixels.ts`: the art as data (a 24 by 24 grid, palette, body, six poses: `idle`, `investigating`, `found`, `failed`, `waiting`, `wave`) and helpers that merge pixels into SVG rects. `staticSvg()` produced `src/app/icon.svg` (the favicon).
- `Mascot.tsx`: `<Mascot pose size avatar walking label />`. Hover: the pupils follow the cursor. Click: a short jump. Pass `label=""` when it is decoration. `avatar` is the 16-pixel head and shell crop (32 px on the timeline, 16 px favicon).
- Animations are CSS keyframes with `steps()` in `globals.css` (`.rpm-*`), so the art moves whole pixels. Nothing blocks input.
- Poses in use: home hero `investigating`; step cards and empty states `idle`, `wave`, `waiting`; the running entry of the timeline and the "now" panel `investigating`; the green step `found`; stopped and could-not-reproduce `failed`; beside the Approve button `waiting`; a merged pull request `found`.
- `SiteFooter.tsx`: a moment every 20 to 40 s at random (peek in from the edge, walk across, pop up and wave, rarely chase a bug). It only uses the footer, never content being read, never on `/runs/*`, never below 640 px width, not with reduced motion, and pauses when the tab is hidden.
- The four comic panels of the design (pixel comics of you doing something else while it works) have no art yet; the step cards use mascot poses in their place.

## Pages

| Route | Component | What it shows |
|---|---|---|
| `/` | `Home` | Logged out: hero with the mascot, tagline, "Log in with GitHub", four step cards. Logged in: repository picker (public first, private behind a toggle), recent investigations, shared-bug alerts, "what it has learned". |
| `/insights` | `Insights` | Totals (investigations, tokens, time to a fix, pull requests), activity by day with a running token total, what isolated the bugs, pull request history. Hook: `useInsights()`. |
| (dashboard box) | `AskMemory` | "Ask the memory": a question in plain words, the answer, and chips showing what the model looked up. Hook: `askMemory(question)`. |
| `/repos/[owner]/[name]` | `IssueList` | Open issues in one bordered list, with an empty state. Triage badges (hook `useTriage`) appear on each row a moment after the list: "likely environment-specific" and "looks like repo#N, fixed". |
| `/repos/[owner]/[name]/issues/[number]` | `TicketForm` | The report, then: who hit the bug, optional recording or screenshot (drop or choose), optional environment variables ("sandbox only"), Investigate. Shows "Sandbox warming up" and then "Sandbox ready". `?notes=` pre-fills the notes (used by "Try again with more detail"). |
| `/runs/[id]` | `RunPage` | Header with status, duration, tokens, attempts and a Stop button while running; the timeline (`run/Timeline.tsx`); a sticky side column: the approval card when a fix is waiting (`run/ApprovalCard.tsx`), the "now" panel while running, the could-not-reproduce panel when stopped; other problems noticed; the reporter's environment. On a narrow screen the approval card comes first. |

Shared: `Shell` (header, footer, the "log in first" screen), `Header`, `ui.tsx` (buttons, status chips, panels, atoms), `run/MatrixTable.tsx` (a column per engine, the isolating row outlined in pink, "isolated: locale" underneath, "separate bug" labels).

## Hooks and actions (`src/lib/hooks.ts`)

| Name | Returns or does |
|---|---|
| `useSession()` | `SessionUser`, `null` (logged out), `undefined` while loading |
| `useRepos()`, `useRuns()`, `useMemoryFacets()`, `useClusters()`, `useIssues(owner, name)` | the data, `null` or `[]` while loading |
| `useWarmSandbox(owner, name)` | starts preparing the sandbox and returns `'warming'`, `'warm'` or `null`; polls every 4 s while warming |
| `useRun(id)` | `{ run, events, similar, error, reload }`; updates live from a change stream (`/api/runs/[id]/stream`), with a poll as the fallback; `run.thinking` carries Argon's thought summary while a step is being thought through |
| `useNow(active)` | the time, refreshed every second while active (the live elapsed counter) |
| `startRun`, `uploadMedia`, `approveRun`, `rejectRun`, `stopRun`, `logout` | actions; each throws an `Error` with a message that is safe to show |

Helpers in `client.ts`: `initials`, `diffStats`, `splitDiff`, `formatDuration`, `formatClock`, `kilo`, `ago`, and the types (`RunView`, `TimelineEvent`, `MatrixRow`, ...).

## What the data gives the screens

- **Run header**: `status`, `createdAt`, `finishedAt`, `tokensUsed` (kept current while running), `tokenCap`.
- **Timeline**: `events` in order (`seq`), each with `tokens`. Types: `understood` (with `mediaObservations` when a recording or screenshot was attached), `profile`, `boot`, `hypothesis`, `memory`, `matrix`, `root_cause`, `test_written`, `fix_attempt`, `green`, `approval_requested`, `pr_opened`, `stopped`. The first entry is "You": `run.notes` and `run.attachments`.
- **Matrix rows**: `name`, `kind` ("as reported", "neutral", "reset one", "added"), `env`, `change` ("en-US instead of tr-TR"), `engines` (`{ chromium: { ok }, webkit: { ok } }`), `failure`, `errors`. `run.isolatedRows` names the rows to highlight.
- **Approval card**: `rootCause` (one sentence, `explanation` below it), `diff` (the test file is shown separately from `testContent`), `profile.notEmulated`, `similar`, `matrix` for the "N of M" chip, `otherProblems`.
- **Could not reproduce**: `reason` and `suggestions` (details that would help, written by Argon from the case).

## When it could not reproduce

`run/ReplyDraft.tsx` (side column of a not-reproduced run): "Draft a reply" writes a comment for the issue, the developer edits it, "Post on #N" posts it (hook `replyToReporter(id, 'draft' | 'post', text)`). The recording's key moments (`mediaMoments`) appear inside the "What the recording shows" fold of the first entry.

## After the pull request is open

`run/RevisionPanel.tsx` (side column): when reviewers have commented, "Address review feedback" starts a revision (states: running with the live thinking line, ready with the reply to the reviewer and the new diff, pushed, failed). "Push to the pull request" is the only action that writes to GitHub; "Discard" drops it. Hook: `reviseRun(id, 'start' | 'push' | 'discard')`. The run's `prState`, `prReviews`, `prComments` and `revision` come with the run.

## Loading states (`src/components/loaders.tsx`)

Every wait has a shape that matches what is coming, so the page does not jump: `RepoRowsSkeleton`, `RunCardsSkeleton`, `LearnedSkeleton` (dashboard), `IssueRowsSkeleton`, `ReportSkeleton` (ticket form), `RunPageSkeleton` (header, timeline entries and side panel). A whole-page wait (checking the session, the Suspense fallback of every page) shows `PageLoader`: the mascot looking through its lens and three pixels. Buttons that wait show `Busy` (pixels and the verb: "Starting", "Opening pull request", "Rejecting", "Stopping after this step"). Skeleton blocks pulse in two whole steps (`.rp-skel`), not a smooth fade, and stop with reduced motion. Each region has `role="status"` and `aria-busy` for screen readers. Hooks distinguish loading from empty: `null` or `undefined` is loading, an empty array is empty.

## States every screen handles

Logged out; loading; error; empty (no repositories, issues or runs); run status `running`, `fixed` (waiting for you, then PR opened or rejected), `not_reproduced`, `no_fix`, `stopped`, `failed`.

## Constraints that already caused bugs

- With `cacheComponents`, pages must not read cookies or the URL on the server without `<Suspense>`: the pages that read the URL are client components wrapped in `<Suspense>` in their `page.tsx`.
- Grids need `grid-cols-1` and `min-w-0` on children, otherwise a long diff line widens the page on a phone. No horizontal scroll at 390 px.
- After editing `globals.css`, restart `npm run dev` if styles look old: Turbopack once kept serving the previous stylesheet.
- Stop and Approve are the only buttons with side effects; keep Approve deliberate, and keep the sentence that nothing is pushed to GitHub until the click.

## Reviewing a change

`npm run dev`, then `npm run ui:shots` in another terminal: it seeds a finished, a running and a could-not-reproduce investigation for a fake user, mocks the GitHub calls, saves 26 screenshots (9 pages and 4 loading states, desktop and phone; it seeds a run with an open pull request and a ready revision, and a not-reproduced run with a drafted reply) in `.ui-shots/`, and removes the seeded data. Before committing: `npm run typecheck`, `npx eslint src scripts`, `npm test`, `npm run build`.
