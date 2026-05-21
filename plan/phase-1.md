# Phase 1 — Auth + Upload + OCR + Prep Storage

## Goal
User can sign in, upload a photo of a textbook page, and have it saved as a Prep — ready to study in Phase 2.

## Scope
- Project scaffold
- Google sign-in
- Image upload + in-browser OCR (background)
- Save raw text as a Prep
- Marketing home page
- My Preps list
- Prep detail page

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
create table preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null default 'Prep #1',
  raw_text text not null,
  created_at timestamptz default now()
);

alter table preps enable row level security;
create policy "users see own preps"
  on preps for all using (auth.uid() = user_id);
```

---

## Screens

### 1. Home (marketing, public)
- App name, tagline, short description
- "Sign in with Google" CTA
- Redirects authenticated users straight to My Preps

### 2. My Preps (authenticated)
- List of preps: title + date created
- "New Prep" button → opens Upload Modal
- Empty state with prompt to create first prep

### 3. Upload Modal
- Triggered by "New Prep" button
- File input (accept image/*, capture=camera on mobile)
- On file select → OCR starts immediately in background (Tesseract.js Web Worker)
- Modal shows progress indicator ("Recognising text…")
- On complete → auto-save Prep → close modal → navigate to Prep page
- No text preview or correction — fully automatic

### 4. Prep Page
- Shows prep title + creation date
- Raw text displayed (read-only, collapsible)
- "Study" button — disabled, coming Phase 2

---

## Key Implementation Notes

- Tesseract.js runs in a Web Worker — UI stays responsive during OCR
- Prep title auto-increments ("Prep #1", "Prep #2") based on user's prep count — LLM naming in Phase 3
- No text editing by user — keep the flow fast and frictionless
- Mobile-first: modal should be full-screen on small screens
- Keep styling minimal but polished enough for a public product

---

## Deliverable
User lands on marketing page → signs in → sees Prep list → uploads photo → OCR runs in background → Prep saved → lands on Prep page.
