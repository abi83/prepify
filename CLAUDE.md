# Prepify — Claude Instructions

## Project Overview
Prepify is a React + Vite + TypeScript app backed by Supabase (auth + database).
Users upload textbook photos, OCR extracts text, and the app generates study quizzes via a multi-agent LLM pipeline.
API keys are BYOK — users supply their own OpenAI key stored in localStorage.

## Tech Stack
- React + Vite (TypeScript)
- Supabase (auth, database)
- CSS Modules
- OpenAI API (LLM pipeline)

## Environment
Copy `.env.example` to `.env`:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key

Supabase project ref: `yyqhjsdgemtcbgjcwhvm`

---

## Database Migrations

All schema changes via **Supabase CLI migrations**. Never edit the schema directly in the dashboard.

```bash
brew install supabase/tap/supabase          # one-time setup
supabase migration new <descriptive_name>   # creates supabase/migrations/<timestamp>_<name>.sql
npm run db:push                             # apply to remote
npm run db:status                           # check status
```

No `supabase login` needed — uses `SUPABASE_DATABASE_PASSWORD` from `.env`. Migrations go directly to remote without a local instance — intentional for this project size.

### Conventions
- One migration per logical change
- RLS policies in the same migration as the table they protect
- snake_case verbs: `create_preps_table`, `add_questions_to_preps`
- Never edit a pushed migration — create a new one instead

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
2. Apply migrations if any (`npm run db:push`)
3. Commit and push the branch
4. Open a PR — no direct pushes to `main`
5. Once reviewed and merged, close the GitHub issue

Supabase migrations still apply against a single environment — no dev/prod split for the Supabase database. The GCP/Cloud Run/Neon infra provisioned via Terraform (`terraform/`, see `terraform/README.md`) does have dev+prod from the start, but that's a separate, not-yet-wired-in backend, not the current Supabase-backed app.

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
