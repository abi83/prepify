# Phase 3 — Agent Pipeline + BYOK Settings + Prep Naming

## Goal
Replace the dummy agent with a proper multi-agent pipeline. Full BYOK settings screen. Preps get LLM-generated names.

## Scope
- Full BYOK settings screen (key + model selection)
- Three-agent pipeline running in-browser (OpenAI only)
- Per-question parallel execution in configurable batches
- Prep naming via LLM
- OCR language selection

---

## BYOK Settings Screen

Full settings page (replaces the modal from Phase 2):

- OpenAI API key input (stored in `localStorage`)
- Model selector: `gpt-5-nano` | `gpt-5-mini` | `gpt-5`
- "Test connection" button — simple ping to verify key works
- Clear key option
- Token usage summary (total tokens consumed across all preps)

No Gemini yet — Phase 4.

---

## OCR Language Selection

Add a language picker to the Upload Modal:

- Dropdown with common languages (English, Spanish, French, German, Russian, Chinese Simplified, Japanese, Korean, Arabic)
- Default: browser locale (`navigator.language`), fallback to English
- Selected language stored in `localStorage` so it persists across uploads
- Tesseract loads the matching `.traineddata` file (~3MB per language, cached after first use)
- Multiple languages supported via `'eng+fra'` syntax for mixed-language pages

---

## Agent Pipeline

> **Prompts for all three agents are brought from Vladimir's existing project — adapt to TypeScript/JSON schema.**

### Overview

The pipeline is no longer one call for all questions. Each question is crafted and validated individually, run in parallel batches.

```
raw_text
  → Agent 1: extract concepts (1 call)
  → Deterministic mixer: assign concepts to question slots
  → Agent 2 × 10: craft one question per slot  (batches of 5)
  → Agent 3 × 10: validate one question per slot (batches of 5)
  → save to DB
```

Total: ~21 LLM calls per prep (1 concept + 10 craft + 10 validate).
Batch size configurable (default 5 parallel calls).

---

### Agent 1 — Concept Extractor
```
Input:  raw_text
Output: concepts[] — JSON array of strings, max 10

System: Extract the key concepts from this educational text that are
        worth testing a student on. Return a JSON array of concept strings.
        Focus on facts, definitions, and relationships. Max 10 concepts.
```

---

### Deterministic Mixer (no LLM)

Assigns each concept to a question slot with a fixed type:

```ts
type QuestionTask = {
  concept: string
  type: 'flashcard' | 'mcq' | 'fill'
}
```

Distribution (configurable):
- 3 flashcards
- 5 MCQ
- 2 fill-in-the-blank

Deterministic — no API call. Maps concept list → task list.

---

### Agent 2 — Question Crafter (per question)
```
Input:  QuestionTask (concept + type)
Output: one question (matches content JSON shape from Phase 2)

System: Craft one study question of the given type for the given concept.
        Return valid JSON matching the schema for that type.
        Make it clear, specific, and unambiguous.
```

Run 10 times in parallel batches of 5.

---

### Agent 3 — Validator (per question)
```
Input:  one question
Output: corrected question, or null if unfixable

System: Review this study question. Check: is it clear? is the answer correct?
        is it worth asking? Fix any issues and return corrected JSON.
        Return null if the question cannot be fixed.
```

Run 10 times in parallel batches of 5.
If a question is rejected (null): Agent 2 retries that slot once. No further feedback loop.

---

### UI Progress

Show per-step progress during generation:
- "Extracting concepts…"
- "Crafting questions (3/10)…"
- "Validating questions (7/10)…"
- "Done — 10 questions generated"

Pipeline is cancellable — abort all in-flight calls if user navigates away.

---

## Prep Naming

Runs in parallel with Agent 2 (after Agent 1), uses the same `runAgent` wrapper:

```
Input:  concepts[]
Output: short title string, 5 words max

System: Given these study concepts, return a short descriptive title
        for this prep. 5 words max. No quotes.
```

Updates `preps.title` in Supabase on completion.

---

## Key Implementation Notes

- All calls go through the `runAgent` wrapper built in Phase 2 — metrics and logging work automatically
- Total token cost ~3–5× the dummy agent — display cumulative token count + estimated cost on Prep page after generation
- Batch size (default 5) should be a constant in config, easy to tune
- No server involved — all OpenAI calls direct from browser

---

## Deliverable
Full per-question agent pipeline in-browser with OpenAI. Preps get meaningful names. Users manage their API key in a proper settings screen.
