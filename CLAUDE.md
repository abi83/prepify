# Prepify — Claude Instructions

## Project Overview
Prepify is a React + Vite + TypeScript app backed by Supabase (auth + database).
Users upload textbook photos, OCR extracts text, and the app generates study quizzes via a multi-agent LLM pipeline.
API keys are BYOK — users supply their own OpenAI key stored in localStorage.

## Tech Stack
- React + Vite (TypeScript)
- Supabase (auth, database)
- Tesseract.js (in-browser OCR)
- CSS Modules

## Environment
Copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key

Supabase project ref: `yyqhjsdgemtcbgjcwhvm`

---

## Database Migrations

All schema changes are managed via **Supabase CLI migrations** from this laptop.
Never apply schema changes directly in the Supabase dashboard SQL editor.

### Setup (one-time)
```bash
brew install supabase/tap/supabase
```
No `supabase login` needed — migrations run using `SUPABASE_DATABASE_PASSWORD` from `.env`.

### Creating a new migration
```bash
supabase migration new <descriptive_name>
# e.g. supabase migration new add_questions_table
```
This creates `supabase/migrations/<timestamp>_<name>.sql`.
Write the SQL in that file, then push.

### Applying migrations to remote
```bash
npm run db:push
```

### Checking migration status
```bash
npm run db:status
```

### Migration conventions
- One migration per logical change (table creation, column addition, policy change, etc.)
- Always include RLS policies in the same migration as the table they protect
- Name migrations with snake_case verbs: `create_preps_table`, `add_questions_to_preps`, `drop_legacy_sessions`
- Never edit a migration that has already been pushed — create a new one instead

---

## Database Schema

### preps
| column | type | notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| user_id | uuid | FK → auth.users |
| title | text | LLM-named after generation |
| raw_text | text | OCR output |
| created_at | timestamptz | auto-set |

RLS: users can only access their own rows (`auth.uid() = user_id`).

### questions
| column | type | notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| prep_id | uuid | FK → preps |
| type | text | `'flashcard'` \| `'single_choice'` \| `'multiple_choice'` \| `'fill_the_gap'` \| `'sorting'` |
| content | jsonb | shape varies by type |
| created_at | timestamptz | auto-set |

RLS: accessible if `prep_id` belongs to the current user.

### attempts
| column | type | notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| prep_id | uuid | FK → preps |
| user_id | uuid | FK → auth.users |
| mode | text | `'quiz'` \| `'test'` |
| score | int | correct answers |
| total | int | total questions |
| created_at | timestamptz | auto-set |

RLS: users can only access their own rows (`auth.uid() = user_id`).

---

## Development

```bash
npm install
npm run dev
```
