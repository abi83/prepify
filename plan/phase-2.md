# Phase 2 — Question UI + Study Modes + Scoring

## Goal
Adapt question model and UI from existing project. Add a dummy single-agent question generator. User can study flashcards, take a quiz, and get a score saved.

## Scope
- Adapt question data model from existing project
- Dummy single-agent question generation (one LLM call, no pipeline yet)
- Minimal BYOK: a simple API key input (OpenAI only for now)
- Flashcard mode
- Test mode with scoring
- Save score to DB

---

## Terminology
- **Prep** — the container created from an uploaded image
- **Cards** — flashcard-type questions inside a Prep
- **Practice Test** — the scored test mode
- **Results** — history of scored attempts

---

## Database additions

```sql
create table questions (
  id uuid primary key default gen_random_uuid(),
  prep_id uuid references preps not null,
  type text not null, -- 'flashcard' | 'mcq' | 'fill'
  content jsonb not null,
  -- flashcard: { front, back }
  -- mcq:       { question, options: string[], answer: number }
  -- fill:      { sentence, answer }
  created_at timestamptz default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  prep_id uuid references preps not null,
  user_id uuid references auth.users not null,
  score int not null,        -- correct answers
  total int not null,        -- total questions
  created_at timestamptz default now()
);

alter table questions enable row level security;
alter table attempts enable row level security;

create policy "users see own questions"
  on questions for all
  using (prep_id in (select id from preps where user_id = auth.uid()));

create policy "users see own attempts"
  on attempts for all using (auth.uid() = user_id);
```

---

## API Key (minimal BYOK)

- Settings icon in header → simple modal with "OpenAI API Key" input
- Stored in `localStorage` as `byok_openai_key`
- If no key → show prompt to enter one before generating
- No server involved — key used directly in browser fetch

---

## Dummy Agent

Single LLM call to OpenAI from the browser:

```
System: You are a study material generator.
User:   Given this text, return a JSON array of 10 study items:
        - 3 flashcards (type: flashcard)
        - 5 multiple choice (type: mcq)
        - 2 fill-in-the-blank (type: fill)
        Text: {raw_text}
```

- Returns structured JSON, saved to `questions` table
- Called once when user opens a session that has no questions yet
- Replace entirely in Phase 3

---

## Screens

### Session page (updated)
- Shows session title
- "Generate questions" button (triggers dummy agent)
- Loading state while generating
- Once generated: tabs for Flashcards / Test

### Flashcard mode
- One card at a time, tap/click to flip
- Previous / Next navigation
- Simple card flip animation

### Test mode
- 10 questions (mix of MCQ and fill-in-the-blank)
- One question per screen, Next button
- At the end: score screen (X out of 10)
- Score saved to `attempts` table
- "Try again" button

### Score history (on session page)
- List of past attempts: date + score

---

## Key Implementation Notes

- Adapt question components from existing project — match to `content` JSON shape above
- No quiz mode (one-at-a-time with feedback) in MVP — just flashcards + test
- Flashcard mode uses all flashcard-type questions; test uses MCQ + fill
- Keep generation behind a manual button — don't auto-trigger

---

## Deliverable
User can generate questions for a session, flip flashcards, take a test, and see their score.
