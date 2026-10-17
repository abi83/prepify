import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { Llm, LlmRequest } from "@/core/ports"
import { DEFAULT_CONCURRENCY, DEFAULT_JOB_SETTINGS, runGeneration, untracked, type GenerationParams, type GenerationProgress, type RunnerPorts } from "@/lib/jobs/generation"
import { consoleLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { noopSampler } from "@/lib/sampler/noopSampler"
import * as jobRepository from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import * as prepStateRepository from "@/repositories/prepStateRepository"
import * as questionRepository from "@/repositories/questionRepository"
import { testCatalog } from "@/test/modelCatalog"

const OWNER = "user-owner"
const METRIC = { score: 1, comment: "ok" }
const RESPONSES: Record<string, unknown> = {
  ocr: { title: "Cells", text: "Mitosis is the division of a cell nucleus into two identical nuclei.", confidence: 0.9, language: "en", visual_elements: [] },
  ConceptExtractor: {
    concepts: [ { name: "Mitosis", description: "Division of a cell nucleus into two identical daughter nuclei.", importance: 0.9, misconceptions: [] } ],
    emptyReason: null,
  },
  PrepMeta: { title: "Mitosis Basics", description: "Covers mitosis, the process by which a cell nucleus divides into two identical daughter nuclei.", grade: 9, discipline: "Biology" },
  FlashcardBuilder: {
    content: { front: "Which process splits a nucleus into two identical nuclei?", back: "Mitosis", back_explanation: "Mitosis yields identical daughter nuclei.", asset_hint: { needed: false, type: null, description: null } },
  },
  QuestionReviewer: {
    scores: { correctness: METRIC, conceptAlignment: METRIC, clarity: METRIC, cognitiveDemand: METRIC, distractorQuality: null },
    comment: "ok",
  },
}

function fakeLlm(calls: string[]): Llm {
  return {
    async complete(request: LlmRequest) {
      const { name } = request.responseFormat
      calls.push(name)
      if (!(name in RESPONSES)) throw new Error(`Unexpected agent "${name}"`)
      return { content: JSON.stringify(RESPONSES[name]), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 32_000 }
    },
  }
}

function ports(llm: Llm): RunnerPorts {
  return {
    store: jobRepository.createPrismaStore(),
    llm,
    logger: consoleLogger,
    sampler: noopSampler,
    catalog: testCatalog,
    data: {
      loadState: prepStateRepository.loadPrepState,
      listImages: prepId => prepImageRepository.listImages(OWNER, prepId),
      loadQuestion: (prepId, questionId) => questionRepository.getOwned(OWNER, prepId, questionId),
      downloadImage: async () => ({ base64: "eA==", mimeType: "image/png" }),
    },
    listUnfinishedJobs: jobRepository.listUnfinishedJobs,
    trackRun: untracked,
  }
}

describe("runGeneration end to end", () => {
  it("drives a prep from an uploaded page to a flashcard, with stage progress", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: null })
    await prepImageRepository.createImage(OWNER, prep.id, `prep-pages/${prep.id}/key-0`)
    const calls: string[] = []
    const events: GenerationProgress[] = []
    const params: GenerationParams = {
      actorId: OWNER, prepId: prep.id, apiKey: "sk-test", signal: new AbortController().signal,
      config: { model: "m", tier: "flex", ...DEFAULT_JOB_SETTINGS }, concurrency: DEFAULT_CONCURRENCY,
      target: { questionCount: 0, flashcardCount: 1, enabledTypes: [ "single_choice" ], difficultyMix: { easy: 1, medium: 0, hard: 0 } },
      onProgress: event => events.push(event),
    }

    await runGeneration(ports(fakeLlm(calls)), params)

    expect(calls[0]).toBe("ocr")
    expect(calls).toEqual(expect.arrayContaining([ "ConceptExtractor", "PrepMeta", "FlashcardBuilder", "QuestionReviewer" ]))
    expect(await prepStateRepository.loadPrepState(prep.id)).toMatchObject({
      images: [ { ocrDone: true, merge: "merged" } ],
      concepts: [ { name: "Mitosis" } ],
      prepMetaDone: true,
      questionCount: 1,
      unfinishedJobCount: 0,
    })
    expect(await prisma.job.groupBy({ by: [ "type", "status" ], _count: true, orderBy: { type: "asc" } })).toEqual([
      { type: "concepts", status: "executed", _count: 1 },
      { type: "concepts.extract", status: "executed", _count: 1 },
      { type: "ocr", status: "executed", _count: 1 },
      { type: "prep.meta", status: "executed", _count: 1 },
      { type: "question", status: "executed", _count: 1 },
    ])
    expect(events.map(event => event.stage)).toEqual(expect.arrayContaining([ "ocr", "concepts", "questions", "done" ]))
    expect(events[events.length - 1]).toEqual({ stage: "done" })
  })
})
