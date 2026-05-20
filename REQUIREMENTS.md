# Functional Requirements

## Auth
- Sign in / sign out with Google
- All data scoped to the authenticated user

## Upload & OCR
- Upload a photo or image of a textbook page
- Text extracted in-browser (no image sent to any server)
- User can preview and confirm extracted text before proceeding

## Study Material Generation
- App processes extracted text and produces:
  - Flashcards (concept ↔ explanation)
  - Multiple choice questions
  - Fill-in-the-blank questions
- Generated material is saved as a named session

## Study Modes
- **Flashcards** — flip cards one by one
- **Quiz** — answer questions one at a time with immediate feedback
- **Test** — 10–20 mixed questions, scored at the end with a summary

## Session History
- User sees a list of all past sessions
- Can resume any session to study or retake the test
- Scores are recorded per session per attempt

## API / Monetization
- **Free tier** — app provides a default model, rate-limited per user per day
- **BYOK** — user can enter their own API key (OpenAI or Gemini) in settings to bypass the limit and choose their model
