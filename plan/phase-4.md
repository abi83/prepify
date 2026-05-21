# Phase 4 — Server Proxy + Gemini + Rate Limiting + Deploy

## Goal
Make the product publicly usable for free users. Add Gemini support. Deploy to production.

## Scope
- Vercel serverless function as free-tier AI proxy
- Rate limiting for free tier users
- Gemini provider (BYOK)
- Production deploy

---

## Free Tier Proxy (Vercel Function)

Single endpoint: `POST /api/generate`

- Accepts: `{ prep_id, raw_text, user_id }`
- Runs the three-agent pipeline server-side using app's `OPENAI_API_KEY`
- Returns: `{ questions[], title }`
- App's key never exposed to browser

### Rate limiting
- Simple DB-based counter per user per day
- Add column to Supabase:

```sql
alter table sessions add column generated_at timestamptz;

-- free_usage table
create table free_usage (
  user_id uuid references auth.users primary key,
  date date not null default current_date,
  count int not null default 0
);
```

- Check + increment on each `/api/generate` call
- Limit: **3 generations per user per day** (MVP — adjust based on cost)
- Return `429` with a clear message when exceeded

### UI behaviour
- Free users see remaining generations count ("2 of 3 left today")
- When limit hit: prompt to add their own API key (BYOK upsell)

---

## Gemini Support (BYOK only)

Add to settings screen:
- Provider toggle: OpenAI | Gemini
- Gemini API key input (stored in `localStorage` as `byok_gemini_key`)
- Model selector: `gemini-1.5-flash` | `gemini-1.5-pro`

Use Vercel AI SDK to abstract provider:

```ts
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'

const model = provider === 'gemini'
  ? google(geminiModel, { apiKey: userKey })
  : openai(openaiModel, { apiKey: userKey })
```

Same three-agent pipeline, different model instance.
Gemini is BYOK only — not available on free tier.

---

## Deploy

### Vercel
- Connect GitHub repo → auto-deploy on push to `main`
- Environment variables:
  - `OPENAI_API_KEY` — app's free-tier key
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` — for server-side Supabase calls

### Supabase
- Enable Google OAuth redirect URLs for production domain
- Run all migrations on production project

### Checklist
- [ ] Custom domain (optional)
- [ ] Error tracking (Sentry free tier — optional)
- [ ] Test free-tier rate limiting end-to-end
- [ ] Test BYOK with both OpenAI and Gemini keys
- [ ] Test on mobile browser (iOS Safari, Android Chrome)

---

## Key Implementation Notes

- The agent pipeline code should be shared between browser (Phase 3) and server (Phase 4) — put it in a `lib/pipeline.ts` module
- Vercel free tier: 100GB-hours/month — more than sufficient for MVP traffic
- Do not store API keys server-side — Gemini BYOK stays browser-only

---

## Deliverable
Live public URL. Free users get 3 generations/day. BYOK users (OpenAI or Gemini) are unlimited.
