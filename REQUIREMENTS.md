# Test Preparer — Requirements

## Functional Requirements

### Auth
- Sign in with Google
- Sessions tied to user account

### Upload & OCR
- Upload a photo or image of a textbook page
- Extract text in-browser via Tesseract.js (no server, no image upload)
- Preview and confirm extracted text before generating

### Study Material Generation
- Three-agent pipeline (runs per upload):
  1. **Concept extractor** — identifies core testable concepts from the text
  2. **Question crafter** — generates flashcards, multiple choice, and fill-in-the-blank questions
  3. **Validator** — reviews and corrects questions for clarity and accuracy
- All generated material saved as a session

### Study Modes
- **Flashcards** — flip between concept and explanation
- **Quiz** — one question at a time, answer and continue
- **Test** — 10–20 mixed questions, scored at the end

### Session History
- List of past sessions per user
- Resume any session to study or retake the test
- View scores per session

### Monetization / API
- **Free tier** — uses app's GPT-4o mini key, rate-limited per user per day
- **BYOK** — user provides their own OpenAI or Gemini API key, stored in localStorage, calls made directly from browser

---

## Technical Decisions

### Frontend
- **React + Vite** — SPA, no SSR needed
- **Mobile-first responsive** — no native app, browser only

### OCR
- **Tesseract.js** — runs in-browser via WASM, no server, no image ever sent anywhere

### AI / Agents
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`) — unified interface across providers
- Free tier calls routed through a Vercel serverless function (key stays server-side)
- BYOK calls made directly from the browser using the user's key

### Auth & Database
- **Supabase** — Google OAuth, Postgres for users/sessions/scores, Row Level Security

### Hosting
- **Vercel** — hosts the React app and the free-tier proxy function
- Free tier sufficient for expected traffic

### Providers Supported
- OpenAI (default free tier: `gpt-4o-mini`)
- Google Gemini (`gemini-1.5-flash` / `gemini-1.5-pro`)
