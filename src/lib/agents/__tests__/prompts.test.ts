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

const PROMPTS: Prompt[] = [
  ocr, conceptExtractor, conceptMerger, prepLabeler, prepNamer, questionReviewer,
  singleChoice, multipleChoice, fillTheGap, flashcard, sorting, diagram, formula, molecule, judgeOcr,
]

describe("prompt identity", () => {
  it("gives every prompt a unique id and a semver version", () => {
    expect(new Set(PROMPTS.map(p => p.id)).size).toBe(PROMPTS.length)
    for (const p of PROMPTS) expect(p.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // Fails when a prompt's text changes: bump its `version`, then update the snapshot (`vitest -u`).
  it("matches the committed id → version → hash snapshot", async () => {
    const actual = Object.fromEntries(await Promise.all(
      [ ...PROMPTS ].sort((a, b) => a.id.localeCompare(b.id)).map(async p => [ p.id, { version: p.version, hash: await hashPrompt(p.text) } ]),
    ))
    await expect(JSON.stringify(actual, null, 2) + "\n").toMatchFileSnapshot("./prompts.snapshot.json")
  })
})
