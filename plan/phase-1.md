# Phase 1 — Auth + Upload + OCR + Session Storage

## Goal
User can sign in, upload a photo of a textbook page, see the extracted text, and have it saved as a session.

## Scope
- Project scaffold
- Google sign-in
- Image upload + in-browser OCR
- Save raw text as a session
- Basic session list

---

## Setup

### Tooling
- React + Vite (TypeScript)
- Supabase JS client
- Tesseract.js

### Supabase
- Create project
- Enable Google OAuth provider
- Create DB tables (see below)

---

## Database (Supabase)

```sql
-- sessions only, no questions yet
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null default 'Test #1',
  raw_text text not null,
  created_at timestamptz default now()
);

alter table sessions enable row level security;
create policy "users see own sessions"
  on sessions for all using (auth.uid() = user_id);
```

---

## Screens

### 1. Login screen
- "Sign in with Google" button
- Redirect to home after auth

### 2. Home screen
- List of past sessions (title + date)
- "New session" button → Upload screen

### 3. Upload screen
- File input (accept image/*, capture=camera for mobile)
- On file select → run Tesseract.js → show extracted text in a textarea
- User can correct text if needed
- "Save & Continue" button → saves session → redirects to session page (placeholder for Phase 2)

### 4. Session page (placeholder)
- Shows session title + raw text
- "Study" button (disabled — coming Phase 2)

---

## Key Implementation Notes

- Tesseract.js runs in a Web Worker — show a progress indicator while it processes
- Session title auto-increments ("Test #1", "Test #2") based on session count — LLM naming comes in Phase 3
- No question generation yet — session is just raw text storage
- Keep styling minimal but mobile-friendly (single column, large tap targets)

---

## Deliverable
User can sign in → upload photo → see OCR text → save session → see it in history.
