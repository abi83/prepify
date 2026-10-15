import { describe, expect, it } from "vitest"

import { prompt as diagram } from "@/lib/agents/assets/DiagramAgent"
import { prompt as formula } from "@/lib/agents/assets/FormulaAgent"
import { prompt as molecule } from "@/lib/agents/assets/MoleculeAgent"
import { prompt as fillTheGap } from "@/lib/agents/builders/FillTheGapBuilder"
import { prompt as flashcard } from "@/lib/agents/builders/FlashcardBuilder"
import { prompt as multipleChoice } from "@/lib/agents/builders/MultipleChoiceBuilder"
import { prompt as singleChoice } from "@/lib/agents/builders/SingleChoiceBuilder"
import { prompt as sorting } from "@/lib/agents/builders/SortingBuilder"
import { prompt as conceptExtractor } from "@/lib/agents/ConceptExtractor"
import { prompt as conceptMerger } from "@/lib/agents/ConceptMerger"
import { prompt as ocr } from "@/lib/agents/OcrAgent"
import { prompt as prepLabeler } from "@/lib/agents/PrepLabeler"
import { prompt as prepNamer } from "@/lib/agents/PrepNamer"
import { prompt as questionReviewer } from "@/lib/agents/QuestionReviewer"
import type { Prompt } from "@/lib/prompt"
import { hashPrompt } from "@/lib/sampler/promptHash"
import { prompt as judgeOcr } from "@evals/evaluators/ocr"

const PROMPTS: Record<string, Prompt> = {
  "ocr": ocr, "concept-extractor": conceptExtractor, "concept-merger": conceptMerger, "prep-labeler": prepLabeler, "prep-namer": prepNamer,
  "question-reviewer": questionReviewer, "single-choice": singleChoice, "multiple-choice": multipleChoice, "fill-the-gap": fillTheGap,
  "flashcard": flashcard, "sorting": sorting, "diagram": diagram, "formula": formula, "molecule": molecule, "judge/ocr": judgeOcr,
}

describe("prompt identity", () => {
  it("gives every prompt a semver version", () => {
    for (const p of Object.values(PROMPTS)) expect(p.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // Fails when a prompt's text changes: bump its `version`, then update the snapshot (`vitest -u`).
  it("matches the committed id → version → hash snapshot", async () => {
    const actual = Object.fromEntries(await Promise.all(
      Object.entries(PROMPTS).sort(([ a ], [ b ]) => a.localeCompare(b)).map(async ([ id, p ]) => [ id, { version: p.version, hash: await hashPrompt(p.text) } ]),
    ))
    await expect(JSON.stringify(actual, null, 2) + "\n").toMatchFileSnapshot("./prompts.snapshot.json")
  })
})
