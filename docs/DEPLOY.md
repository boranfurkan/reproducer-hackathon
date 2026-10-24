# Deploying

ReProducer is a long-running Node server, not a set of serverless functions. An investigation starts in the background of the request that created it and runs for several minutes, the sandbox keep-alive is a timer, and the run page polls. Host it where the process stays alive and keeps its CPU between requests.

## What is ready

- `next.config.ts` sets `output: 'standalone'`. `npm run build` produces `.next/standalone` (about 43 MB with its minimal `node_modules`).
- `Dockerfile` (three stages: install, build, run on `node:22-slim`, runs as the unprivileged `node` user, listens on `PORT`, default 8080) and `.dockerignore`.
- Verified without Docker (the daemon was not running): the standalone output, `.next/static` and `public` copied into an empty directory, started with `node server.js` and only runtime environment variables, serves the pages, the static assets, the API routes and the login redirect.
- Not verified: `docker build` itself, and anything on a real host.

## Environment variables (set on the host, never in the image or the repo)

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini key of the hackathon project |
| `MONGODB_URI` | Atlas connection string |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | GitHub OAuth app |
| `AUTH_SECRET` | key that encrypts the session cookie (changing it logs everyone out) |
| `KEEP_SANDBOX_WARM` | on by default; `false` turns off the ping of the warm sandbox every 9 minutes (up to about 72 minutes) so the Playwright install survives; costs a few thousand tokens per ping |
| `PORT` | set by most hosts; the image defaults to 8080 |

## Steps

1. Pick the host (see below), build and push the image, or let the host build from the repo's `Dockerfile`.
2. Set the variables above.
3. In the GitHub OAuth app (Settings, Developer settings), **add** a redirect URI `https://<your-host>/api/auth/callback/github` (the app allows several) and keep the `localhost` one for development.
4. In Atlas, Network Access: the cluster currently allows all IPs. Keep it for the hackathon, tighten afterwards.
5. Open the site, log in, run an investigation, and check that the run page keeps updating after you close and reopen it.

## Host notes

- **Google Cloud Run** (the hackathon project allows it, and it disappears with the account the day after): use `--min-instances=1` so the process does not scale to zero, **`--no-cpu-throttling`** (CPU always allocated: with the default, CPU is throttled once the response is sent and the background investigation crawls), `--timeout=3600`, and `--concurrency` of a handful (investigations share the warm sandbox only one at a time, the rest start their own). Example (project and region are yours to fill in):

  ```bash
  gcloud run deploy reproducer --source . --region <region> --allow-unauthenticated \
    --min-instances=1 --no-cpu-throttling --timeout=3600 --port=8080 \
    --set-env-vars=KEEP_SANDBOX_WARM=true \
    --set-secrets=GEMINI_API_KEY=...,MONGODB_URI=...,AUTH_GITHUB_ID=...,AUTH_GITHUB_SECRET=...,AUTH_SECRET=...
  ```

  `gcloud` is not installed on the development machine.
- **Railway, Fly, Render**: any plain container service works; make sure it does not sleep and does not kill background work after a response.
- The session cookie is `Secure` in production, so the site must be served over HTTPS (all of the above do this).

## After the hackathon

The temporary Google account, the API key, the Cloud Run service and the sandbox environments are deleted about a day later. Export the repos, the demo recording and anything else worth keeping first.
