# Phase 2 — Question UI + Study Modes + Scoring

## Goal
Adapt question model and UI from existing project. Build a real agent wrapper infrastructure with a dummy single-agent implementation. User can study flashcards, take a quiz, take a test, and have scores saved.

## Scope
- Adapt question data model and UI components from existing project
- Real agent wrapper (observability, metrics, logging) with dummy single-agent implementation
- Minimal BYOK: API key input (OpenAI only, gpt-4o-mini hardcoded)
- Flashcard mode
- Quiz mode (immediate feedback)
- Test mode (scored at the end)
- Save attempts to DB

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
  mode text not null,          -- 'quiz' | 'test'
  score int not null,          -- correct answers
  total int not null,          -- total questions
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
- Provider: OpenAI hardcoded, model: `gpt-4o-mini` hardcoded for now
- Stored in `localStorage` with shape `{ provider, model, key }`
- If no key → show prompt to enter one before generating
- No server involved — key used directly in browser

---

## Agent Wrapper

> **Bring the observability pattern from the Python project and adapt to TypeScript.**

The dummy agent uses a single LLM call, but it must be wrapped in real infrastructure — because Phase 3 will drop in three real agents without changing the wrapper.

### What the wrapper provides

- **Token tracking** — prompt tokens, completion tokens, total per call
- **Latency** — time per agent call in ms
- **Structured logging** — agent name, input summary, output summary, metrics
- **Error handling** — catch API errors, timeouts, malformed JSON responses
- **Abort support** — cancellable via `AbortController` (user navigates away)

### Interface

```ts
type AgentResult<T> = {
  output: T
  metrics: {
    latency_ms: number
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

async function runAgent<T>(config: {
  name: string
  systemPrompt: string
  userPrompt: string
  schema: ZodSchema<T>   // validates + types the JSON response
  apiKey: string
  signal?: AbortSignal
}): Promise<AgentResult<T>>
```

Metrics logged to console in dev, stored in memory for display in UI (token count shown after generation).

### Dummy Agent prompt

```
System: You are a study material generator.
User:   Given this text, return a JSON array of 10 study items:
        - 3 flashcards (type: flashcard)
        - 5 multiple choice questions (type: mcq)
        - 2 fill-in-the-blank (type: fill)
        Text: {raw_text}
```

- Single `runAgent` call
- Output validated with Zod against question schema
- Saved to `questions` table on success
- Called once per prep — skipped if questions already exist
- Replaced entirely in Phase 3 (wrapper stays)

---

## Screens

### Prep page (updated)
- Shows prep title + creation date
- "Generate" button → triggers dummy agent
- Shows loading state with progress ("Generating questions…")
- After generation: shows token count + latency as a subtle stat line
- Tabs: **Cards** / **Quiz** / **Test**
- Results section: list of past attempts with date, mode, score

### Cards mode (adapt from existing project)
- One card at a time, tap/click to flip front ↔ back
- Previous / Next navigation
- Simple flip animation

### Quiz mode (adapt from existing project)
- One question at a time (MCQ + fill)
- Immediate feedback after each answer — correct/incorrect shown before Next
- Progress indicator (3 of 10)
- Summary screen at end (score + review of wrong answers)
- Attempt saved to DB

### Test mode (adapt from existing project)
- 10 questions (MCQ + fill), no feedback during
- One question per screen, answer locked on selection
- Score screen at end (X out of 10)
- Attempt saved to DB
- "Try again" button

---

## Key Implementation Notes

- Adapt question components from existing project — align to `content` JSON shape above
- Agent wrapper is the most important deliverable here — it must be extensible for Phase 3
- Keep generation behind a manual button — never auto-trigger
- Quiz and Test use MCQ + fill questions; Cards use flashcard type only

---

## Deliverable
User generates questions for a prep, studies with flashcards, takes a quiz with live feedback, takes a test for a final score — all saved to history.
