# Prepify — Claude Instructions

## Project Overview
Prepify is a Next.js (App Router) + TypeScript app backed by Auth.js (auth) and Neon Postgres via Prisma (data).
Users upload textbook photos, OCR extracts text, and the app generates study quizzes via a multi-agent LLM pipeline.
API keys are BYOK — users supply their own OpenAI key stored in localStorage; the OpenAI-calling pipeline stays entirely client-side.
Page/component structure and data-flow conventions: see [Coding Guidelines](#coding-guidelines) below.

## Tech Stack
- Next.js (App Router, TypeScript)
- Auth.js (Google OAuth)
- Neon Postgres + Prisma (data layer)
- Tailwind CSS + shadcn/ui
- OpenAI API (LLM pipeline)

## Coding Guidelines

- **Fail fast.** Invalid state throws — it doesn't fall back to a default or an empty result. No `catch` that swallows and returns `[]`/`null`.
- **No nested if-else.** Guard clauses / early returns instead. Still nesting after that — extract a function.
- **Minimize optional fields.** An optional field claims both the present and absent shape are valid; don't add one just because one code path happens not to set it.

Everything else — rendering/data flow, file & naming conventions, types — lives in the wiki: [Contributing-Nextjs-Guidelines](https://github.com/abi83/prepify/wiki/Contributing-Nextjs-Guidelines). Styling and UI-component conventions: [Contributing-UI-Guidelines](https://github.com/abi83/prepify/wiki/Contributing-UI-Guidelines).
Both are binding — read before writing component or page code.

## Code-style

Concise and direct, everywhere — code, comments, docs, commit messages, issues, PRs, and chat replies. Say it once, at the shortest length that stays clear. Long output is a cost the reader pays; default to less and expand only where a reader genuinely needs it.

### Comments
Prefer self-documenting code — clear names for variables, functions, workflow steps, files — over comments that restate what the code already says. Add a comment only for a hidden constraint, a non-obvious workaround, or a reason a reader couldn't otherwise infer. When one is warranted, keep it short: a line or two, not a paragraph.

### Prose (ADRs, wiki pages, issue/PR bodies, docs)
- State the claim once, in the section it belongs to. Don't restate the same point across Context/Decision/Reasoning in different words — that's padding, not clarity.
- Ground every claim in a fact — code, a measurement, a doc, an ecosystem data point — not in "the user/owner wants/said X." Authority isn't evidence; if the only reason given is that someone asked for it, find or state the actual reason.
- A comparison between options is a table: options as columns (or rows), criteria as the other axis, one fact per cell, and an explicit winner per criterion. Prose describing each option in turn is not a comparison table even if it's formatted as one.
- Cut qualifying clauses and hedges that don't change what a reader does with the sentence.
- PR bodies use exactly three sections — **What changed** / **Before merging** / **After merging** — and nothing else; rationale belongs on the linked issue. A **Notes** section is for genuine exceptions, not routine. Full convention on the wiki's Contributing page.

## Environment
Copy `.env.example` to `.env.local`:
- `DATABASE_URL_POOLING` — pooled Neon connection string, as the `app_runtime` role (DML only, no DDL — migrations always go through `DATABASE_URL_DIRECT`)
- `DATABASE_URL_DIRECT` — direct Neon connection string (running migrations only)
- `AUTH_SECRET` — Auth.js JWT signing secret (generate with `npx auth secret`)
- `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET` — Google OAuth client credentials, passed explicitly to Auth.js's Google provider

---

## Database Migrations

All schema changes via **Prisma migrations** against Neon Postgres (`prisma/schema.prisma` is the source of truth): `npm run db:migrate` / `db:status` / `db:generate`.

One-time setup, get the dev Neon connection strings into `.env.local`:
```bash
gcloud secrets versions access latest --secret=database-url-direct --project=prepify-dev-vk  # → DATABASE_URL_DIRECT
gcloud secrets versions access latest --secret=database-url-pooling --project=prepify-dev-vk # → DATABASE_URL_POOLING
```

There's one shared **dev** Neon branch today, no per-PR isolation — tracked at [#85](https://github.com/abi83/prepify/issues/85), which will also document the finished local + CI workflow here. Until then: a human authors migrations locally against dev; an agent (interns pipeline, or Claude non-interactive) doesn't run `db:migrate` — flag a needed schema change for the owner instead of authoring one directly.

Never edit an already-committed migration — create a new one instead. Authorization is enforced in the repository layer (e.g. `prepRepository.isReadableBy`), not Postgres RLS.

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
2. Apply migrations if the ticket needs one — see Database Migrations above for who does this and how
3. Commit, push, open a PR — commit/PR/branch conventions are on the wiki's `Contributing` page
4. Once reviewed and merged, close the GitHub issue

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

Before pushing, run the same checks CI gates on: `npm test` and `npm run build`. Lint/typecheck aren't wired into CI yet — testing strategy beyond that is a placeholder pending #78.
