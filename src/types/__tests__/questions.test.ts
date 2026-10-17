import { describe, expect, it } from "vitest"

import {
  assetHintSchema,
  fillTheGapContentSchema,
  flashcardContentSchema,
  multipleChoiceContentSchema,
  singleChoiceContentSchema,
  sortingContentSchema,
} from "@/types/questions"

const noAsset = { needed: false, type: null, description: null }
const ids = [ "A", "B", "C", "D", "E", "F" ]

function choiceAnswers(correct: boolean[]) {
  return correct.map((is_correct, i) => ({
    id: ids[i],
    text: `Answer ${i}`,
    is_correct,
    explanation: `${is_correct ? "Correct" : "Incorrect"}: because ${i}`,
  }))
}

function singleChoice(overrides: object = {}) {
  return {
    question: "Which one?",
    answers: choiceAnswers([ true, false, false, false ]),
    rationale: "r",
    asset_hint: noAsset,
    ...overrides,
  }
}

function multipleChoice(overrides: object = {}) {
  return {
    question: "Which ones?",
    answers: choiceAnswers([ true, true, false, false ]),
    rationale: "r",
    asset_hint: noAsset,
    ...overrides,
  }
}

function sortingContent(correctIndexes: number[], overrides: object = {}) {
  return {
    question: "Order these",
    answers: correctIndexes.map((correct_index, i) => ({
      id: ids[i], text: `Item ${i}`, correct_index, explanation: "because",
    })),
    rationale: "r",
    asset_hint: noAsset,
    ...overrides,
  }
}

function fillGap(overrides: object = {}) {
  return {
    question: "The {{gap:1}} and {{gap:2}} circuits.",
    gaps: [
      { index: 1, correct_answer_id: "pulmonary", explanation: "e1" },
      { index: 2, correct_answer_id: "systemic", explanation: "e2" },
    ],
    answers: [
      { id: "pulmonary", label: "Pulmonary", multiple_usage: false },
      { id: "systemic", label: "Systemic", multiple_usage: false },
      { id: "lymph", label: "Lymphatic", multiple_usage: false },
      { id: "portal", label: "Portal", multiple_usage: false },
    ],
    rationale: "r",
    asset_hint: noAsset,
    ...overrides,
  }
}

describe("assetHintSchema", () => {
  it("accepts needed=true with type and description", () => {
    expect(assetHintSchema.safeParse({ needed: true, type: "formula", description: "E=mc2" }).success).toBe(true)
  })

  it("accepts needed=false with both null", () => {
    expect(assetHintSchema.safeParse(noAsset).success).toBe(true)
  })

  it("rejects needed=true with null type or description", () => {
    expect(assetHintSchema.safeParse({ needed: true, type: null, description: "d" }).success).toBe(false)
    expect(assetHintSchema.safeParse({ needed: true, type: "formula", description: null }).success).toBe(false)
  })

  it("rejects needed=false with a type or description", () => {
    expect(assetHintSchema.safeParse({ needed: false, type: "formula", description: null }).success).toBe(false)
    expect(assetHintSchema.safeParse({ needed: false, type: null, description: "d" }).success).toBe(false)
  })
})

describe("flashcardContentSchema", () => {
  const card = { front: "f", back: "b", back_explanation: "e", asset_hint: noAsset }

  it("accepts a filled flashcard", () => {
    expect(flashcardContentSchema.safeParse(card).success).toBe(true)
  })

  it.each([ "front", "back", "back_explanation" ])("rejects empty %s", field => {
    expect(flashcardContentSchema.safeParse({ ...card, [field]: "" }).success).toBe(false)
  })
})

describe("singleChoiceContentSchema", () => {
  it("accepts a valid question", () => {
    expect(singleChoiceContentSchema.safeParse(singleChoice()).success).toBe(true)
  })

  it("rejects ids that are not A-D in order", () => {
    const answers = choiceAnswers([ true, false, false, false ]).map((a, i) => ({ ...a, id: ids[3 - i] }))
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers })).success).toBe(false)
  })

  it("rejects duplicate ids", () => {
    const answers = choiceAnswers([ true, false, false, false ]).map(a => ({ ...a, id: "A" }))
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers })).success).toBe(false)
  })

  it("rejects duplicate answer text", () => {
    const answers = choiceAnswers([ true, false, false, false ]).map(a => ({ ...a, text: "Same" }))
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers })).success).toBe(false)
  })

  it("rejects an explanation that contradicts is_correct", () => {
    const answers = choiceAnswers([ true, false, false, false ])
    answers[0].explanation = "Incorrect: nope"
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers })).success).toBe(false)
    const swapped = choiceAnswers([ true, false, false, false ])
    swapped[1].explanation = "Correct: yes"
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers: swapped })).success).toBe(false)
  })

  it("rejects empty strings", () => {
    expect(singleChoiceContentSchema.safeParse(singleChoice({ question: "" })).success).toBe(false)
    expect(singleChoiceContentSchema.safeParse(singleChoice({ rationale: "" })).success).toBe(false)
    const answers = choiceAnswers([ true, false, false, false ])
    answers[1].text = ""
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers })).success).toBe(false)
  })

  it("rejects strings over the prompt caps", () => {
    expect(singleChoiceContentSchema.safeParse(singleChoice({ question: "x".repeat(801) })).success).toBe(false)
    expect(singleChoiceContentSchema.safeParse(singleChoice({ rationale: "x".repeat(241) })).success).toBe(false)
    const longText = choiceAnswers([ true, false, false, false ])
    longText[1].text = "x".repeat(301)
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers: longText })).success).toBe(false)
    const longExplanation = choiceAnswers([ true, false, false, false ])
    longExplanation[1].explanation = `Incorrect: ${"x".repeat(250)}`
    expect(singleChoiceContentSchema.safeParse(singleChoice({ answers: longExplanation })).success).toBe(false)
  })

  it("accepts strings at the caps", () => {
    const answers = choiceAnswers([ true, false, false, false ])
    answers[1].text = "x".repeat(300)
    answers[1].explanation = `Incorrect: ${"x".repeat(239)}`
    const content = singleChoice({ question: "x".repeat(800), rationale: "x".repeat(240), answers })
    expect(singleChoiceContentSchema.safeParse(content).success).toBe(true)
  })
})

describe("multipleChoiceContentSchema", () => {
  it("accepts a valid question with 4-6 sequential ids", () => {
    expect(multipleChoiceContentSchema.safeParse(multipleChoice()).success).toBe(true)
    const six = multipleChoice({ answers: choiceAnswers([ true, true, true, false, false, false ]) })
    expect(multipleChoiceContentSchema.safeParse(six).success).toBe(true)
  })

  it("rejects gaps in ids", () => {
    const answers = choiceAnswers([ true, true, false, false ])
    answers[3].id = "E"
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ answers })).success).toBe(false)
  })

  it("rejects duplicate ids", () => {
    const answers = choiceAnswers([ true, true, false, false ])
    answers[1].id = "A"
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ answers })).success).toBe(false)
  })

  it("rejects duplicate answer text", () => {
    const answers = choiceAnswers([ true, true, false, false ])
    answers[1].text = answers[0].text
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ answers })).success).toBe(false)
  })

  it("rejects an explanation that contradicts is_correct", () => {
    const answers = choiceAnswers([ true, true, false, false ])
    answers[2].explanation = "Correct: wrong prefix"
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ answers })).success).toBe(false)
  })

  it("rejects empty and over-long strings", () => {
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ question: "" })).success).toBe(false)
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ question: "x".repeat(801) })).success).toBe(false)
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ rationale: "" })).success).toBe(false)
    expect(multipleChoiceContentSchema.safeParse(multipleChoice({ rationale: "x".repeat(241) })).success).toBe(false)
  })
})

describe("sortingContentSchema", () => {
  it("accepts a real permutation of 1-4", () => {
    expect(sortingContentSchema.safeParse(sortingContent([ 3, 1, 4, 2 ])).success).toBe(true)
  })

  it("rejects non-integer correct_index values even when the four are distinct", () => {
    // Distinct but non-integer — not a permutation of {1,2,3,4} despite passing a set-size check
    const result = sortingContentSchema.safeParse(sortingContent([ 1, 1.5, 2, 3 ]))
    expect(result.success).toBe(false)
  })

  it("rejects a repeated correct_index", () => {
    const result = sortingContentSchema.safeParse(sortingContent([ 1, 1, 2, 3 ]))
    expect(result.success).toBe(false)
  })

  it("rejects ids other than A-D in order", () => {
    const content = sortingContent([ 3, 1, 4, 2 ])
    content.answers[0].id = "E"
    expect(sortingContentSchema.safeParse(content).success).toBe(false)
  })

  it("rejects duplicate ids", () => {
    const content = sortingContent([ 3, 1, 4, 2 ])
    content.answers[1].id = "A"
    expect(sortingContentSchema.safeParse(content).success).toBe(false)
  })

  it("rejects empty and over-long strings", () => {
    expect(sortingContentSchema.safeParse(sortingContent([ 3, 1, 4, 2 ], { question: "" })).success).toBe(false)
    expect(sortingContentSchema.safeParse(sortingContent([ 3, 1, 4, 2 ], { rationale: "x".repeat(241) })).success).toBe(false)
    const longText = sortingContent([ 3, 1, 4, 2 ])
    longText.answers[0].text = "x".repeat(161)
    expect(sortingContentSchema.safeParse(longText).success).toBe(false)
    const longExplanation = sortingContent([ 3, 1, 4, 2 ])
    longExplanation.answers[0].explanation = "x".repeat(201)
    expect(sortingContentSchema.safeParse(longExplanation).success).toBe(false)
  })
})

describe("fillTheGapContentSchema", () => {
  it("accepts a valid question", () => {
    expect(fillTheGapContentSchema.safeParse(fillGap()).success).toBe(true)
  })

  it("rejects a marker with no gap", () => {
    const content = fillGap({ question: "The {{gap:1}}, {{gap:2}} and {{gap:3}} circuits." })
    expect(fillTheGapContentSchema.safeParse(content).success).toBe(false)
  })

  it("rejects a gap with no marker", () => {
    expect(fillTheGapContentSchema.safeParse(fillGap({ question: "The {{gap:1}} circuit." })).success).toBe(false)
  })

  it("rejects gap indices that are duplicated or not contiguous from 1", () => {
    const gaps = fillGap().gaps
    const skipped = fillGap({
      question: "The {{gap:2}} and {{gap:3}} circuits.",
      gaps: [ { ...gaps[0], index: 2 }, { ...gaps[1], index: 3 } ],
    })
    expect(fillTheGapContentSchema.safeParse(skipped).success).toBe(false)
    const duplicated = fillGap({ gaps: [ gaps[0], { ...gaps[1], index: 1 } ] })
    expect(fillTheGapContentSchema.safeParse(duplicated).success).toBe(false)
  })

  it("rejects duplicate answer ids", () => {
    const content = fillGap()
    content.answers[3].id = "lymph"
    expect(fillTheGapContentSchema.safeParse(content).success).toBe(false)
  })

  it("rejects two gaps sharing an answer without multiple_usage", () => {
    const content = fillGap()
    content.gaps[1].correct_answer_id = "pulmonary"
    expect(fillTheGapContentSchema.safeParse(content).success).toBe(false)
  })

  it("accepts two gaps sharing an answer with multiple_usage", () => {
    const content = fillGap()
    content.gaps[1].correct_answer_id = "pulmonary"
    content.answers[0].multiple_usage = true
    expect(fillTheGapContentSchema.safeParse(content).success).toBe(true)
  })

  it("rejects when every answer is used by a gap", () => {
    const content = fillGap({
      question: "{{gap:1}} {{gap:2}} {{gap:3}} {{gap:4}}",
      gaps: [ "pulmonary", "systemic", "lymph", "portal" ].map((id, i) => ({
        index: i + 1, correct_answer_id: id, explanation: "e",
      })),
    })
    expect(fillTheGapContentSchema.safeParse(content).success).toBe(false)
  })

  it("rejects empty and over-long strings", () => {
    expect(fillTheGapContentSchema.safeParse(fillGap({ rationale: "" })).success).toBe(false)
    expect(fillTheGapContentSchema.safeParse(fillGap({ rationale: "x".repeat(301) })).success).toBe(false)
    const longLabel = fillGap()
    longLabel.answers[0].label = "x".repeat(36)
    expect(fillTheGapContentSchema.safeParse(longLabel).success).toBe(false)
    const longExplanation = fillGap()
    longExplanation.gaps[0].explanation = "x".repeat(151)
    expect(fillTheGapContentSchema.safeParse(longExplanation).success).toBe(false)
  })
})
