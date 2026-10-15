import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/currentUser", () => ({ requireUserId: async () => "user-owner" }))

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

const runBuilder = vi.fn()
vi.mock("@/lib/agents/builders", () => ({ BUILDERS: new Proxy({}, { get: () => (...args: unknown[]) => runBuilder(...args) }) }))

const runQuestionReviewer = vi.fn()
vi.mock("@/lib/agents/QuestionReviewer", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/agents/QuestionReviewer")>()),
  runQuestionReviewer: (...args: unknown[]) => runQuestionReviewer(...args),
}))

import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { runJob } from "@/core/runJob"
import { createQuestionJobDefinition } from "@/lib/jobs/questionJob"
import { consoleLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { ForbiddenError } from "@/repositories/errors"
import { createPrismaStore } from "@/repositories/jobRepository"
import * as prepRepository from "@/repositories/prepRepository"
import { testCatalog } from "@/test/modelCatalog"

const OWNER = "user-owner"
const OTHER = "user-other"
const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 1 }
const SPEC = { questionType: "flashcard", difficulty: "easy" }

const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }

const META = { model: "gpt-5-nano", tier: "flex", promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }

const CONCEPT = { name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [] }

const QUESTION = {
  type: "flashcard",
  content: { front: "What is mitosis?", back: "Cell division", back_explanation: "Produces two identical cells", asset_hint: { needed: false, type: null, description: null } },
}

const METRIC = { score: 0.5, comment: "Too vague" }
const REVIEW = {
  scores: { correctness: METRIC, conceptAlignment: METRIC, clarity: METRIC, cognitiveDemand: METRIC, distractorQuality: null },
  comment: "Needs work",
}

async function makeConcept(userId: string) {
  const prep = await prepRepository.createPrep(userId, { title: "Prep", language: "en" })
  const conceptsJob = await prisma.job.create({
    data: {
      prepId: prep.id, type: "concepts", status: "executed",
      model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0,
      createdBy: userId, output: [],
    },
  })
  const concept = await prisma.concept.create({ data: { ...CONCEPT, language: "en", producedByJobId: conceptsJob.id } })
  return { prep, concept }
}

async function execute(jobId: string) {
  const definition = createQuestionJobDefinition([ { ...CONCEPT, language: "en" } ], { llm: NOOP_LLM, logger: consoleLogger, sampler: noopSampler, catalog: testCatalog })
  return runJob(
    definition,
    { store: createPrismaStore(), llm: NOOP_LLM, progress: NOOP_PROGRESS },
    { actorId: OWNER, jobId, apiKey: "sk-test", signal: new AbortController().signal },
  )
}

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.question.deleteMany()
  await prisma.job.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.prep.deleteMany()
  runBuilder.mockReset()
  runQuestionReviewer.mockReset()
})

it("throws when the input concepts span languages", () => {
  expect(() => createQuestionJobDefinition([ { ...CONCEPT, language: "en" }, { ...CONCEPT, language: "de" } ], { llm: NOOP_LLM, logger: consoleLogger, sampler: noopSampler, catalog: testCatalog }))
    .toThrow("more than one language")
})

describe("question job", () => {
  it("runs end-to-end: the Question row and GenerationMeta rows are persisted, rejected attempts flagged wasted", async () => {
    const { prep, concept } = await makeConcept(OWNER)
    runBuilder.mockResolvedValue({ output: QUESTION, meta: META })
    runQuestionReviewer
      .mockResolvedValueOnce({ output: { review: REVIEW, passed: false }, meta: META })
      .mockResolvedValueOnce({ output: { review: REVIEW, passed: true }, meta: META })

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "question", [ concept.id ], CONFIG, SPEC)
    expect(job.question).toEqual(SPEC)

    const result = await execute(job.id)
    expect(result).toMatchObject({ committed: true, status: "executed" })
    expect(runBuilder.mock.calls[1][5]).toMatchObject({ question: QUESTION })

    const questions = await prisma.question.findMany({ where: { producedByJobId: job.id } })
    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({ prepId: prep.id, type: "flashcard", difficulty: "easy", language: "en", content: QUESTION.content })

    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(4)
    expect(metas.filter(m => m.wasted)).toHaveLength(2)
    expect(metas[0]).toMatchObject({ jobId: job.id, promptTokens: 10 })
  })

  it("fails once the attempt limit is exhausted, with every call recorded wasted", async () => {
    const { concept } = await makeConcept(OWNER)
    runBuilder.mockResolvedValue({ output: QUESTION, meta: META })
    runQuestionReviewer.mockResolvedValue({ output: { review: REVIEW, passed: false }, meta: META })

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "question", [ concept.id ], CONFIG, SPEC)

    const result = await execute(job.id)
    expect(result).toMatchObject({ committed: true, status: "failed" })
    expect(runBuilder).toHaveBeenCalledTimes(2)

    expect(await prisma.question.count()).toBe(0)
    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(4)
    expect(metas.every(m => m.wasted)).toBe(true)
  })

  it("records the calls made before an error as wasted", async () => {
    const { concept } = await makeConcept(OWNER)
    runBuilder.mockResolvedValue({ output: QUESTION, meta: META })
    runQuestionReviewer.mockRejectedValue(new Error("reviewer down"))

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "question", [ concept.id ], CONFIG, SPEC)

    const result = await execute(job.id)
    expect(result).toMatchObject({ committed: true, status: "failed", failureReason: "reviewer down" })

    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(1)
    expect(metas[0].wasted).toBe(true)
  })

  it("rejects a non-owner actor", async () => {
    const { concept } = await makeConcept(OWNER)
    const store = createPrismaStore()

    await expect(store.createJob(OTHER, "question", [ concept.id ], CONFIG, SPEC)).rejects.toThrow(ForbiddenError)
  })
})
