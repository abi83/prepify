# Phase 3 — Agent Pipeline + BYOK Settings + Session Naming

## Goal
Replace dummy agent with a proper three-agent pipeline. Proper BYOK settings screen. Sessions get LLM-generated names.

## Scope
- Proper BYOK settings screen (key + model selection)
- Three-agent pipeline running in-browser (OpenAI only)
- Session naming via LLM
- User brings their own prompts (configurable system prompts)

---

## BYOK Settings Screen

Full settings page (replace the modal from Phase 2):

- OpenAI API key input (stored in `localStorage`)
- Model selector: `gpt-4o-mini` | `gpt-4o`
- "Test connection" button — simple ping to verify key works
- Clear key option

No Gemini yet — Phase 4.

---

## Three-Agent Pipeline

All three calls run sequentially in the browser using the user's key via `fetch` (or Vercel AI SDK if already added).

### Agent 1 — Concept Extractor
```
Input:  raw_text
Output: list of core concepts (JSON array of strings)

System: Extract the key concepts from this educational text that are
        worth testing a student on. Return a JSON array of concept strings.
        Focus on facts, definitions, and relationships. Max 10 concepts.
```

### Agent 2 — Question Crafter
```
Input:  concepts[]
Output: questions[] (same JSON shape as Phase 2)

System: Given these concepts, craft study questions.
        Return a JSON array with:
        - 3 flashcards (front/back)
        - 5 multiple choice (question, 4 options, answer index)
        - 2 fill-in-the-blank (sentence with ___, answer)
        Make questions clear and unambiguous.
```

### Agent 3 — Validator
```
Input:  questions[]
Output: questions[] (corrected)

System: Review these study questions. For each one, check:
        - Is it clear and unambiguous?
        - Is the answer correct?
        - Is the question worth asking?
        Fix any issues. Return the corrected JSON array.
        Remove any question you cannot fix.
```

### Execution flow
```
raw_text → Agent 1 → concepts → Agent 2 → draft questions
         → Agent 3 → validated questions → save to DB
```

Show per-agent progress in the UI ("Extracting concepts… Crafting questions… Validating…")

---

## Session Naming

After Agent 1 extracts concepts, one additional short call:

```
Input:  concepts[]
Output: short title string (5 words max)

System: Given these concepts, return a short descriptive title
        for this study session. 5 words max. No quotes.
```

Update `sessions.title` with the result.

---

## Custom Prompts (optional, stretch goal)
- Advanced settings: allow user to override Agent 1/2/3 system prompts
- Stored in `localStorage`
- Reset to defaults button

---

## Key Implementation Notes

- Keep pipeline cancellable — if user navigates away, abort ongoing calls
- If Agent 3 removes all questions, fall back to Agent 2 output with a warning
- Costs roughly 3–5x more tokens than the dummy agent — show estimated token count in settings as a transparency feature
- No server involved — all OpenAI calls direct from browser

---

## Deliverable
Full agent pipeline in-browser with OpenAI. Sessions get meaningful names. Users manage their own API key properly.
