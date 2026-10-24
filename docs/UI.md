# UI contract

For redesigning the interface. The goal: a new look touches **only** `src/components/`, `src/styles/globals.css` and the page wrappers in `src/app/**/page.tsx`. All data and actions come from `src/lib/hooks.ts`; the HTTP shapes are typed in `src/lib/client.ts`. Do not call `fetch` or `api()` from a component.

## How the front end is built

- Next.js 16 App Router, React 19, Tailwind CSS v4 (`@import "tailwindcss"` in `src/styles/globals.css`), Geist fonts through `next/font`.
- Pages are **client components that fetch from the API routes**. The project enables `cacheComponents`, which forbids reading cookies or the URL on the server without a `<Suspense>` boundary, so the three pages that read the URL are wrapped in `<Suspense>` in their `page.tsx` and use `useParams()` inside the client component. Keep that pattern. Read `node_modules/next/dist/docs/` before changing routing or rendering (this is not the Next.js of older versions).
- Dark mode follows `prefers-color-scheme` through CSS variables in `globals.css` (`--background`, `--foreground`) and Tailwind `dark:` classes. Both modes must stay readable.
- Layout rules that already caused bugs: grids need `grid-cols-1` and `min-w-0` on children (a long diff line otherwise widens the page on a phone); no horizontal page scroll at 390 px width; side gutters of 16 px on phones.
- Avatars come from GitHub as plain `<img>`; guard an empty URL.

## Pages

| Route | Component | What it shows |
|---|---|---|
| `/` | `Home` | Logged out: landing page (what it does, four steps, "Continue with GitHub" linking to `/api/auth/login`). Logged in: repository picker, recent investigations, "what it has learned", shared-bug alerts. |
| `/repos/[owner]/[name]` | `IssueList` | Open issues of one repository. |
| `/repos/[owner]/[name]/issues/[number]` | `TicketForm` | The issue, then the form: who hit the bug (free text), optional recording or screenshot, optional environment variables, the Investigate button. |
| `/runs/[id]` | `RunPage` | One investigation: header with status, duration and tokens; the live timeline; the approval card; other problems noticed; the reporter's environment. |

Shared: `Shell` (page frame plus a "log in first" screen when logged out), `Header` (brand, user, log out), `ui.tsx` (Card, Badge, buttons, ErrorNote).

## Hooks and actions (`src/lib/hooks.ts`)

| Name | Returns / does | Loading and error |
|---|---|---|
| `useSession()` | `SessionUser` or `null` (logged out) | `undefined` while loading |
| `useRepos()` | `{ repos, error }` (public and private; the UI chooses what to show) | `repos` is `null` while loading |
| `useRuns()` | recent runs, newest first | `null` while loading |
| `useMemoryFacets()` | `{ total, variable[], engine[], locale[] }` buckets | `null` while loading or unavailable |
| `useClusters()` | shared-bug alerts | `[]` until the stream processor runs |
| `useIssues(owner, name)` | `{ issues, error }` | `issues` is `null` while loading |
| `useWarmSandbox(owner, name)` | starts preparing the sandbox; call once from the ticket form | none |
| `useRun(id)` | `{ run, events, similar, error, reload }`, refreshes itself every 2.5 s while `run.status === 'running'` | `run` is `null` while loading |
| `startRun({ owner, name, issueNumber, notes, envText, media })` | run id; the investigation continues on the server | throws `Error` with a message safe to show |
| `uploadMedia(file)` | a `MediaItem` (mp4, webm, mov, png, jpg, webp, up to 50 MB) | throws |
| `approveRun(id)` | opens the pull request: **the only action that writes to GitHub** | throws |
| `rejectRun(id)` | records the rejection | throws |
| `logout()` | ends the session (the caller reloads the page) | |

Types (`client.ts`): `RunView`, `TimelineEvent`, `MatrixRow`, `RepoItem`, `IssueItem`, `MediaItem`, `SimilarFix`, `MemoryFacets`, `ClusterAlert`, `SessionUser`. Helper: `ago(iso)`.

## States every screen must handle

- **Logged out** on any page except `/`: a clear prompt to log in (`Shell` does this).
- **Loading** (every hook starts as `null`/`undefined`), **error** (show the message), **empty** (no repositories, no issues, no runs yet).
- **Run status** (`run.status`): `running`, `fixed` (verified fix, waiting for approval), `not_reproduced`, `no_fix`, `stopped`, `failed`. Anything except `running` and `fixed` means "the agent stopped without a verified fix and changed nothing": offer to try again with more detail (link back to the ticket form).
- **After approval**: `run.prUrl` set means a pull request was opened (show the link); `run.rejectedAt` set means it was rejected. Both end the approval card.

## What the run page has to communicate

The product's argument is on this page, so a redesign should keep all of it visible:
1. **The timeline** (`events`, already in order): types `understood`, `profile`, `boot`, `hypothesis`, `memory`, `matrix`, `root_cause`, `test_written`, `fix_attempt`, `green`, `approval_requested`, `pr_opened`, `stopped`. `summary` is one line (clamp long ones with a "more" control); `data` depends on the type: `matrix` has an array of rows `{ name, ok, failure, errors }` (show pass/fail per environment), `memory` has the recalled past bugs, `understood` may carry `mediaObservations` (what the recording showed), `test_written` has the test output text. Times are `atMs` since the start.
2. **The matrix**: the same replay under several environments, with pass and fail. This is the evidence for "what only this user has".
3. **The approval card** (`status === 'fixed'`): root cause (`run.rootCause`), the diff (`run.diff`, unified diff text: colour added and removed lines), what could not be reproduced (`run.profile.notEmulated`), similar past fixes (`similar`), and the two buttons. **Keep the sentence that nothing has been pushed to GitHub until the developer approves**, and keep Approve visually deliberate (it opens a real pull request).
4. **Other problems noticed** (`run.otherProblems`): failures seen under other environments that are not part of this issue and were left alone.
5. **Duration and tokens**: `finishedAt - createdAt` and `tokensUsed`.

## Copy and rules to keep

- Public repositories only: private ones stay behind an explicit toggle with the note that they cannot be investigated yet.
- Environment variables box: "Sent to the sandbox only; never stored or logged."
- A run takes a few minutes; say so on the form.
- Never show a GitHub token (the app never has one in the browser).

## Reviewing a design

`npm run dev` in one terminal, then `npm run ui:shots` in another. It seeds a finished and a running investigation for a fake user, mocks the GitHub calls, and saves 24 screenshots in `.ui-shots/` (`light|dark` x `desktop|phone` x the 6 pages: landing, dashboard, issues, ticket form, run fixed, run running), then removes the seeded data. For a quick check of console errors across pages in dev mode, load each page in a browser and look for the Next.js error dialog.

## Checks before committing a redesign

`npm run typecheck`, `npx eslint src scripts`, `npm test`, `npm run build`, and look at the screenshots at phone width in both colour schemes.
