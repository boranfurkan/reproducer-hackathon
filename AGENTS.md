<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules (ReProducer)

Applies to anyone, human or tool, working in this repo.

- Read `docs/` first. `docs/DECISIONS.md` records what was decided and why; do not re-open a decision without a reason.
- Models and caps live in `src/lib/config.ts`. Do not hardcode model names or limits elsewhere.
- Use the Gemini Interactions API (`ai.interactions.create`), never the legacy `generateContent` path. Argon: use `thinking_level`, not `thinking_budget`; do not set temperature, top_p, top_k or `cached_content`.
- Never commit secrets. `.env*` is gitignored; if the Gemini key reaches GitHub, the whole project's keys are killed.
- Env vars supplied by users go to the sandbox only. Never store them in MongoDB or log them.
- Every external action (PR, push, comment) must sit behind the approval gate.
- Keep the Gemini call count per investigation low (account usage is monitored). Respect `LIMITS` in config.
- Code for the demo must be written during the hackathon. No pasted-in prior projects.
- Third-party skills live in `skills/`. Treat them as reference material.
