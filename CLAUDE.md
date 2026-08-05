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

TypeScript types: `src/lib/supabase.ts` (Prep) and `src/types/questions.ts` (Question, Attempt, Asset).
Full schema and RLS policies: `supabase/migrations/`.

---

## Issue Tracking

All work is tracked via **GitHub Issues** on this repo. When the user says "ticket" or "issue", that means a GitHub issue.

### Workflow
- When asked to implement a ticket/issue, fetch it first with `gh issue view <number>` before touching code.
- When spotting a bug or a good idea during work, **suggest creating a GitHub issue** — do not implement right away. Prioritisation is the owner's call.
- Use `gh issue create` to file a new issue when the user agrees.

### Implementation flow
For every ticket/feature, in order:
1. Implement the code changes
2. Apply migrations if any (`npm run db:push`)
3. Commit the code
4. Push to `main`
5. Close the GitHub issue

No PRs, no staging — we ship directly to main. "Test on prod" fits this project size.

---

## Development

```bash
npm install
npm run dev
```
