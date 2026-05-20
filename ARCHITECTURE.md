# Technical Architecture

## Stack

| Concern | Solution |
|---|---|
| Frontend | React + Vite (SPA) |
| Hosting | Vercel (free tier) |
| Auth | Supabase (Google OAuth) |
| Database | Supabase Postgres |
| OCR | Tesseract.js (in-browser WASM) |
| AI SDK | Vercel AI SDK |
| Free-tier proxy | Vercel Serverless Function |

## AI Providers
- **OpenAI** — default free tier model: `gpt-4o-mini`
- **Google Gemini** — `gemini-1.5-flash` / `gemini-1.5-pro`

## Agent Pipeline
Three sequential LLM calls per upload:
1. **Concept extractor** — pulls core testable concepts from raw text
2. **Question crafter** — generates flashcards, MCQ, fill-in-the-blank from concepts
3. **Validator** — checks questions for clarity and correctness, fixes issues

## API Key Routing

```
Free tier:  Browser → Vercel Function → OpenAI (app key, server-side)
BYOK:       Browser → OpenAI / Gemini API directly (user key, localStorage)
```

Same agent pipeline code runs in both paths via a provider abstraction.

## Data Model (Supabase)

```
users         — id, email, provider, created_at
sessions      — id, user_id, title, raw_text, created_at
questions     — id, session_id, type, content (JSON)
attempts      — id, session_id, user_id, score, answers (JSON), created_at
```
