# Prepify

Upload a photo of any textbook page. Get flashcards, quizzes, and tests — instantly.

Built for my daughter. Might be useful for yours too.

---

## How it works

OCR runs entirely in the browser (Tesseract.js — your photo never leaves the device). The extracted text goes through a multi-agent LLM pipeline that generates five question types: flashcards, single-choice, multiple-choice, fill-the-gap, and sorting.

Three study modes: **Flashcards** (flip), **Quiz** (immediate per-question feedback), **Test** (scored at the end).

You bring your own OpenAI API key — stored in `localStorage`, sent only to OpenAI.

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

React 18 + Vite · TypeScript · Supabase (auth + Postgres) · Tesseract.js · CSS Modules
