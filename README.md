# Prepify

Upload a photo of any textbook page. Get flashcards, quizzes, and tests — instantly.

Built for my daughter. Might be useful for yours too.

---

## How it works

Your photo is sent to OpenAI Vision for OCR, then the extracted text goes through a multi-agent LLM pipeline that generates five question types: flashcards, single-choice, multiple-choice, fill-the-gap, and sorting.

Three study modes: **Flashcards** (flip), **Quiz** (immediate per-question feedback), **Test** (scored at the end).

You bring your own OpenAI API key — stored in `localStorage`, used only to call OpenAI directly from your browser.

---

## Getting started

Node 18+, a Supabase project, an OpenAI API key.

```bash
git clone https://github.com/abi83/prepify.git
cd prepify
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Open the app → Settings → paste your OpenAI key.

---

## Stack

React 18 + Vite · TypeScript · Supabase (auth + Postgres) · OpenAI API · CSS Modules
