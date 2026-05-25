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

### Request
```
Authorization: Bearer <supabase_jwt>
Body: { prep_id }
```

User identity is extracted from the JWT server-side — never trusted from the request body.

### Text input limits

Free tier uses the app's API key, so input size is capped to keep costs predictable:

- **Hard limit:** 10 000 characters of OCR'd text and only 1 full photo upload
- If the uploaded text exceeds the limit, reject the request with a clear user-facing message before the pipeline runs. No silent truncation.
- No chunking, no merger — single extraction call per generation. One photo → one concepts list -> one set of questions.

This constraint is intentional. Users who need multi-page support should add their own API key (BYOK).

### Flow
1. Verify JWT → extract `user_id`
2. Check rate limit for `user_id` — return `429` if exceeded
3. Fetch `raw_text` from `preps` table using `prep_id` + `user_id` (RLS enforced via service role)
4. **Reject with `413` if `raw_text` exceeds 10 000 characters** — return a message prompting BYOK
5. Run three-agent pipeline server-side using app's `OPENAI_API_KEY`
6. Write generated `questions` and updated `title` directly to Supabase
7. Increment usage counter
8. Return `{ success: true }`

Frontend receives `{ success: true }` and re-fetches questions and title from Supabase as normal — no payload in the response.

### Rate limiting

```sql
create table free_usage (
  user_id uuid references auth.users primary key,
  date date not null default current_date,
  count int not null default 0
);
```

- Check + increment on each `/api/generate` call
- Reset when `date` changes (next day)
- Limit: **3 generations per user per day** (adjust based on cost)
- Return `429` with a clear message when exceeded

### UI behaviour
- Free users see remaining generations ("2 of 3 left today")
- When limit hit: prompt to add their own API key (BYOK upsell)

---

## Gemini Support (BYOK only)

Add to settings screen:
- Provider toggle: OpenAI | Gemini
- Gemini API key input (stored in `localStorage`)
- Model selector: `gemini-3.x-flash` | `gemini-3.x-pro`

Use Vercel AI SDK to abstract the provider — same pipeline, different model instance:

```ts
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'

const model = provider === 'gemini'
  ? google(geminiModel, { apiKey: userKey })
  : openai(openaiModel, { apiKey: userKey })
```

Gemini is BYOK only — not available on the free tier.

---

## Deploy

### Vercel environment variables
- `OPENAI_API_KEY` — app's free-tier key (never exposed to browser)
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — for server-side DB reads/writes (bypasses RLS safely)

> Supabase requires two values (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), not a single `DATABASE_URL`. The service role key is what allows the function to read any row — keep it server-side only.

### Supabase
- Enable Google OAuth redirect URLs for production domain
- Run all migrations on production project

### Checklist
- [ ] Connect GitHub repo → auto-deploy on push to `main`
- [ ] Set all env vars in Vercel dashboard
- [ ] Enable Google OAuth for production domain in Supabase
- [ ] Test free-tier rate limiting end-to-end
- [ ] Test BYOK with both OpenAI and Gemini keys
- [ ] Test on mobile browser (iOS Safari, Android Chrome)
- [ ] Custom domain (optional)
- [ ] Error tracking — Sentry free tier (optional)

---

## Key Implementation Notes

- Agent pipeline lives in `lib/pipeline.ts` — shared between browser (Phase 3) and this function (Phase 4), only the model instantiation differs
- The function reads from and writes to Supabase directly — frontend never receives question data from the function response
- Vercel free tier: 100GB-hours/month — sufficient for MVP traffic
- Gemini BYOK calls stay browser-only — never routed through the server

---

## Deliverable
Live public URL. Free users get 3 generations/day. BYOK users (OpenAI or Gemini) are unlimited.
