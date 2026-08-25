# Prepify — Claude Instructions

## Project Overview
Prepify is a Next.js (App Router) + TypeScript app backed by Supabase (auth) and Neon Postgres via Prisma (data).
Users upload textbook photos, OCR extracts text, and the app generates study quizzes via a multi-agent LLM pipeline.
API keys are BYOK — users supply their own OpenAI key stored in localStorage; the OpenAI-calling pipeline stays entirely client-side.
`app/**/page.tsx` are Server Components that fetch initial data via server actions (`src/actions/*.ts`, backed by `src/repositories/*.ts`) and pass it as props into the client screens (`src/screens/*.tsx`). Client-triggered mutations call the same server actions directly.

## Tech Stack
- Next.js (App Router, TypeScript)
- Supabase (auth only)
- Neon Postgres + Prisma (data layer)
- CSS Modules
- OpenAI API (LLM pipeline)

## Code Style

### Comments
Prefer self-documenting code — clear names for variables, functions, workflow steps, files — over comments that restate what the code already says. Add a comment only for a hidden constraint, a non-obvious workaround, or a reason a reader couldn't otherwise infer. When one is warranted, keep it short: a line or two, not a paragraph.

## Environment
Copy `.env.example` to `.env.local`:
- `DATABASE_URL_POOLING` — pooled Neon connection string (app runtime)
- `DATABASE_URL_DIRECT` — direct Neon connection string (running migrations only)
- `AUTH_SECRET` — Auth.js JWT signing secret (generate with `npx auth secret`)
- `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET` — Google OAuth client credentials, passed explicitly to Auth.js's Google provider

Supabase project ref: `yyqhjsdgemtcbgjcwhvm`

---

## Database Migrations

All schema changes via **Prisma migrations** against Neon Postgres (`prisma/schema.prisma` is the source of truth). `supabase/migrations/*.sql` is historical record only — no new migrations go there.

One-time setup — get the dev Neon connection strings into `.env.local`:
```bash
gcloud secrets versions access latest --secret=database-url-direct --project=prepify-dev-vk  # → DATABASE_URL_DIRECT
gcloud secrets versions access latest --secret=database-url-pooling --project=prepify-dev-vk # → DATABASE_URL_POOLING
```

```bash
npm run db:migrate    # prisma migrate dev — authors + applies a new migration against dev
npm run db:status     # prisma migrate status
npm run db:generate   # prisma generate (also runs automatically via postinstall)
```

Migrations are authored and applied against the **dev** Neon branch locally, then the generated SQL under `prisma/migrations/` is committed and reviewed as part of the PR. CI (`.github/workflows/deploy.yml`) runs `prisma migrate deploy` before each Cloud Run deploy — idempotent, so it's a no-op if you already applied it locally, but catches anything you forgot. The prod step only runs after the same manual-approval gate that already protects prod deploys.

### Conventions
- Aim for one migration per PR — iterate locally, then collapse into a single clean migration before committing (drop and regenerate if you made several). Easier once per-PR Neon branches (#85) land.
- Prisma's own naming (`prisma migrate dev --name <descriptive_name>`)
- Never edit an already-committed migration — create a new one instead

---

## Database Schema

Schema and RLS policies live in migrations; application types mirror them in code.

---

## Issue Tracking

All work is tracked via **GitHub Issues** on this repo. When the user says "ticket" or "issue", that means a GitHub issue.

### Workflow
- When asked to implement a ticket/issue, fetch it first with `gh issue view <number>` before touching code.
- When spotting a bug or a good idea during work, **suggest creating a GitHub issue** — do not implement right away. Prioritisation is the owner's call.
- Use `gh issue create` to file a new issue when the user agrees.

### Implementation flow
For every ticket/feature, in order:
1. Create a branch, implement the code changes
2. Apply migrations if any (`npm run db:migrate`, against dev — see Database Migrations below)
3. Commit and push the branch
4. Open a PR — no direct pushes to `main`. PRs are squash-merged, so give the PR itself a [Conventional Commit](https://www.conventionalcommits.org/) title (`feat:`, `fix:`, `refactor:`, etc.) — release-please derives the version bump and changelog from commit history on `main`, so a non-conventional title is an invisible, unlabeled change there.
5. Once reviewed and merged, close the GitHub issue

### TODO/FIXME comments
A comment marking deliberately temporary or incomplete state (a placeholder, a workaround standing in for real work) needs a ticket link, not just a description — an untracked TODO never gets picked up:

```
# TODO(#123): replace with the real container image once the deploy pipeline exists
```

Remove the comment itself once #123 ships — don't just close the issue and leave the comment behind. A TODO that outlives its ticket reads as still-pending work that isn't.

---

## Wiki

The GitHub wiki (separate repo, cloned locally at `../prepify.wiki`) is a high-level companion to the code — vision and direction, not implementation.

- **Self-documenting code is the default.** The wiki captures intent and shape — what code and commit history can't. It doesn't restate what's already legible from reading the repo.
- **Concepts and modules, never files, lines, or values.** No file paths, no constants, no counts — anything that lives in code will drift out of sync the moment it changes there.
- **No ticket, issue, epic, or status tracking.** That lives in GitHub Issues/Projects.
- Edits are direct-push (wikis have no PR flow) — but commit only when there's a meaningful change, not for every wording tweak.

---

## Development

```bash
npm install
npm run dev
```
