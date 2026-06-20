# Prepify

Upload a photo of any textbook page. Get flashcards, quizzes, and tests — instantly.

Prepify runs OCR in the browser (no image ever leaves your device), then sends the extracted text through a multi-agent LLM pipeline that generates study material. You bring your own OpenAI API key.

---

## How it works

```
Photo → Tesseract.js (in-browser OCR) → raw text
                                             │
                             ┌───────────────┼───────────────┐
                             ▼               ▼               ▼
                     ConceptExtractor  (parallel chunks)
                             │
                      ConceptMerger  (dedup + merge across chunks)
                             │
                   ┌─────────┴──────────┐
                   ▼                    ▼
             QuestionBuilders      PrepNamer
          (5 types, concurrent)   (fires in parallel)
                   │
             QuestionReviewer  (per-question, retries once on rejection)
                   │
                Supabase  (questions + title persisted)
```

**Five question types:** flashcards, single-choice MCQ, multiple-choice MCQ, fill-the-gap, sorting.

**Three study modes:** Flashcards (flip), Quiz (immediate feedback), Test (scored at the end).

Crash recovery is built in — if the pipeline is interrupted mid-run, the next attempt resumes from the last saved checkpoint rather than starting over.

---

## Tech stack

| Concern | Solution |
|---|---|
| Frontend | React 18 + Vite (TypeScript) |
| Auth | Supabase (Google OAuth) |
| Database | Supabase Postgres + RLS |
| OCR | Tesseract.js (WASM, runs in-browser) |
| LLM | OpenAI API (BYOK) |
| Styling | CSS Modules |

---

## Getting started

**Prerequisites:** Node 18+, a Supabase project, an OpenAI API key.

```bash
git clone https://github.com/abi83/prepify.git
cd prepify
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Then open the app, go to Settings, and enter your OpenAI API key. It's stored in `localStorage` — never sent anywhere except directly to OpenAI.

### Database setup

Migrations are managed with the Supabase CLI:

```bash
brew install supabase/tap/supabase   # one-time
npm run db:push                       # apply all migrations
```

---

## Project structure

```
src/
  lib/
    agents/          # LLM agent implementations
      builders/      # one builder per question type
    pipeline.ts      # orchestrates the full generation run
    pipelineStore.ts # crash-recovery checkpointing (Supabase)
    apiKey.ts        # BYOK key storage and model config
  pages/             # route-level components
  components/        # shared UI
  types/             # TypeScript types
supabase/
  migrations/        # all schema changes as SQL files
```

---

## Wiki

- [Architecture](../../wiki/Architecture) — agent pipeline, data model, key routing
- [Requirements](../../wiki/Requirements) — functional spec
