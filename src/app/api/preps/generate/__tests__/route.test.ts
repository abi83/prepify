import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/preps/generate/route"
import { MAX_IMAGES } from "@/lib/config"
import { serverPorts } from "@/lib/jobs/serverExecution"
import { prisma } from "@/lib/prisma"
import { STALE_HEARTBEAT_MS } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"

const h = vi.hoisted(() => ({
  userId: "u1" as string | null,
  afterCallbacks: [] as Array<() => Promise<void>>,
  ran: [] as string[],
  keysSeenByRun: [] as string[],
  failConcepts: false,
  failOcr: false,
  logs: [] as string[],
  downloads: [] as string[],
}))

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})
vi.mock("next/server", () => ({
  NextRequest: Request,
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
  after: (cb: () => Promise<void>) => { h.afterCallbacks.push(cb) },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => (h.userId ? { user: { id: h.userId } } : null) }))
vi.mock("@/lib/env", () => ({ config: { GCS_BUCKET_NAME: "bucket", SAMPLES_BUCKET_NAME: "samples", SAMPLE_RATE: 0 } }))
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return {
        file: (key: string) => ({
          download: async () => { h.downloads.push(key); return [ Buffer.from("img") ] },
          getMetadata: async () => [ { contentType: "image/png" } ],
        }),
      }
    }
  },
}))
vi.mock("@/lib/logger/server", async () => {
  const { createLogger } = await import("@/lib/logger/core")
  return { serverLogger: createLogger({ transport: line => { h.logs.push(line) } }) }
})
vi.mock("@/lib/sampler/gcsSampleStore", () => ({ createGcsSampler: () => ({}) }))
vi.mock("@/lib/jobs/serverExecution", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/jobs/serverExecution")>()
  return { serverPorts: vi.fn(actual.serverPorts) }
})

// Job definitions are faked; everything else (store, tracker, planner, runner, route) is real.
function fakeDefinition(type: string, output: (key: string) => unknown) {
  return () => ({
    type,
    run: async (ctx: { apiKey: string }) => {
      if (type === "ocr" && h.failOcr) throw new Error("ocr boom")
      if (type === "concepts" && h.failConcepts) throw new Error("concepts boom")
      h.ran.push(type)
      h.keysSeenByRun.push(ctx.apiKey)
      const meta = { model: "m", tier: "flex", temperature: 0, maxTokens: 1, promptTokens: 1, cachedTokens: 0, completionTokens: 1, totalTokens: 2, costUsd: 0, toolCalls: 0, executionMs: 1 }
      return { output: output(ctx.apiKey), metas: [ meta ], wastedMetas: [] }
    },
  })
}
vi.mock("@/lib/jobs/ocrJob", () => ({ createOcrJobDefinition: fakeDefinition("ocr", () => ({ language: "en", title: "T", text: "t", visual_elements: [] })) }))
vi.mock("@/lib/jobs/conceptsExtractJob", () => ({
  createConceptsExtractJobDefinition: fakeDefinition("concepts.extract", () => ({
    status: "found",
    concepts: [ { name: "Mitosis", description: "Cell division process in eukaryotes that yields two identical cells", importance: 0.9, misconceptions: [], language: "en" } ],
  })),
}))
vi.mock("@/lib/jobs/conceptsJob", () => ({
  createConceptsJobDefinition: fakeDefinition("concepts", () => [ { name: "Mitosis", description: "Cell division process", importance: 0.9, misconceptions: [], language: "en" } ]),
}))
vi.mock("@/lib/jobs/prepMetaJob", () => ({
  createPrepMetaJobDefinition: fakeDefinition("prep.meta", () => ({ title: "Biology", description: "Cells", grade: null, discipline: null })),
}))
vi.mock("@/lib/jobs/questionJob", () => ({
  createQuestionJobDefinition: fakeDefinition("question", () => ({ type: "flashcard", content: { front: "f", back: "b" } })),
}))

const API_KEY = "sk-secret-key-123"
const TARGET = { questionCount: 5, enabledTypes: [ "flashcard" ], difficultyMix: { easy: 1, medium: 0, hard: 0 } }

function post(body: unknown) {
  return POST(new NextRequest("http://test/api/preps/generate", { method: "POST", body: JSON.stringify(body) }))
}

async function makePrep(userId = "u1") {
  const prep = await prepRepository.createPrep(userId, { title: "Prep", language: "en" })
  const image = await prepImageRepository.createImage(userId, prep.id, `prep-pages/${prep.id}/page-0.png`)
  return { prep, image }
}

async function runAfter() {
  const callbacks = h.afterCallbacks.splice(0)
  await Promise.all(callbacks.map(cb => cb()))
}

beforeEach(async () => {
  h.userId = "u1"
  h.afterCallbacks.length = 0
  h.ran.length = 0
  h.keysSeenByRun.length = 0
  h.downloads.length = 0
  h.logs.length = 0
  h.failConcepts = false
  h.failOcr = false
  vi.mocked(serverPorts).mockClear()
  await prisma.question.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.jobInput.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
})

describe("POST /api/preps/generate", () => {
  it("returns immediately, then runs the job graph through serverPorts", async () => {
    const { prep } = await makePrep()

    const res = await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })

    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ status: "triggered" })
    expect(h.ran).toEqual([])
    expect(serverPorts).not.toHaveBeenCalled()

    await runAfter()

    expect(serverPorts).toHaveBeenCalledTimes(1)
    expect(vi.mocked(serverPorts).mock.calls[0][0]).toBe(API_KEY)
    expect(h.downloads).toEqual([ `prep-pages/${prep.id}/page-0.png` ])
    expect(h.ran.slice(0, 4)).toEqual([ "ocr", "concepts.extract", "prep.meta", "concepts" ])
    expect(await prisma.question.count({ where: { prepId: prep.id } })).toBe(5)
    expect(await prisma.job.count({ where: { prepId: prep.id, status: { not: "executed" } } })).toBe(0)
  })

  it.each([
    [ "an unlisted model", { model: "not-a-model" }, /not in the model catalog/ ],
    [ "a local model", { model: "google/gemma-4-26b-a4b" }, /belongs to "lmstudio"/ ],
    [ "an unknown tier", { tier: "not-a-tier" }, /not available/ ],
  ])("rejects %s with 400 before starting a run", async (_name, override, message) => {
    const { prep } = await makePrep()

    const response = await post({ apiKey: API_KEY, prepId: prep.id, ...override })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(message)
    expect(h.afterCallbacks).toHaveLength(0)
  })

  it("rejects a prep with more than MAX_IMAGES pages", async () => {
    const { prep } = await makePrep()
    // Bypasses `createImage`, which enforces the cap itself.
    await prisma.prepImage.createMany({
      data: Array.from({ length: MAX_IMAGES }, (_, i) => ({ prepId: prep.id, gcsKey: `prep-pages/${prep.id}/page-${i + 1}.png` })),
    })

    const response = await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/at most 10 pages/)
    expect(h.afterCallbacks).toHaveLength(0)
  })

  it("rejects unauthenticated, malformed, unknown-prep and foreign-prep requests", async () => {
    const { prep } = await makePrep("someone-else")

    h.userId = null
    expect((await post({ apiKey: API_KEY, prepId: prep.id })).status).toBe(401)
    h.userId = "u1"
    expect((await post({ prepId: prep.id })).status).toBe(400)
    expect((await post({ apiKey: API_KEY, prepId: "nope" })).status).toBe(404)
    expect((await post({ apiKey: API_KEY, prepId: prep.id })).status).toBe(403)
    expect(h.afterCallbacks).toHaveLength(0)
  })

  it("rejects a second concurrent run on the same prep, and allows one after the first finishes", async () => {
    const { prep } = await makePrep()

    expect((await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })).status).toBe(202)
    expect((await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })).status).toBe(409)

    await runAfter()
    expect((await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })).status).toBe(202)
  })

  it("rejects a run while another instance's job has a fresh heartbeat", async () => {
    const { prep, image } = await makePrep()
    await prisma.job.create({
      data: { prepId: prep.id, type: "ocr", status: "running", heartbeatAt: new Date(), model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: "u1", inputs: { create: [ { entityType: "prepImage", entityId: image.id } ] } },
    })

    expect((await post({ apiKey: API_KEY, prepId: prep.id })).status).toBe(409)
  })

  it("keeps the API key out of every DB row, log, and payload", async () => {
    const { prep } = await makePrep()
    h.failConcepts = true

    await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })
    await runAfter()
    h.failConcepts = false
    await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })
    await runAfter()

    expect(h.keysSeenByRun.length).toBeGreaterThan(0)
    expect(new Set(h.keysSeenByRun)).toEqual(new Set([ API_KEY ]))

    const dump = JSON.stringify({
      preps: await prisma.prep.findMany(),
      images: await prisma.prepImage.findMany(),
      jobs: await prisma.job.findMany(),
      jobInputs: await prisma.jobInput.findMany(),
      concepts: await prisma.concept.findMany(),
      questions: await prisma.question.findMany(),
      metas: await prisma.generationMeta.findMany(),
    })
    expect(dump).not.toContain(API_KEY)
    expect(h.logs.length).toBeGreaterThan(0)
    expect(h.logs.join("\n")).not.toContain(API_KEY)
  })

  it("keeps the API key out of every DB row and log when OCR fails and is resumed", async () => {
    const { prep } = await makePrep()
    h.failOcr = true
    await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })
    await runAfter()
    expect(h.ran).toEqual([])
    expect(await prisma.job.count({ where: { prepId: prep.id, type: "ocr", status: "failed" } })).toBe(1)

    h.failOcr = false
    await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })
    await runAfter()
    expect(h.ran[0]).toBe("ocr")
    expect(h.keysSeenByRun[0]).toBe(API_KEY)

    const dump = JSON.stringify({
      images: await prisma.prepImage.findMany(),
      jobs: await prisma.job.findMany(),
      jobInputs: await prisma.jobInput.findMany(),
      metas: await prisma.generationMeta.findMany(),
    })
    expect(dump).not.toContain(API_KEY)
    expect(h.logs.length).toBeGreaterThan(0)
    expect(h.logs.join("\n")).not.toContain(API_KEY)
  })

  it("resume re-runs only the incomplete steps", async () => {
    const { prep } = await makePrep()
    h.failConcepts = true
    await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })
    await runAfter()
    expect(h.ran).toEqual([ "ocr", "concepts.extract", "prep.meta" ])

    h.failConcepts = false
    await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })
    await runAfter()

    expect(h.ran.filter(type => type === "ocr")).toHaveLength(1)
    expect(h.ran.filter(type => type === "concepts.extract")).toHaveLength(1)
    expect(h.ran.filter(type => type === "concepts")).toHaveLength(1)
    expect(await prisma.job.count({ where: { prepId: prep.id, type: "ocr" } })).toBe(1)
    expect(await prisma.job.count({ where: { prepId: prep.id, type: "concepts.extract" } })).toBe(1)
    expect(await prisma.job.count({ where: { prepId: prep.id, type: "concepts" } })).toBe(1)
    expect(await prisma.question.count({ where: { prepId: prep.id } })).toBe(5)
  })

  it("resumes an interrupted job (stale heartbeat) without re-planning finished steps", async () => {
    const { prep, image } = await makePrep()
    await prisma.prepImage.update({ where: { id: image.id }, data: { ocrResult: { title: "T", text: "t", visual_elements: [] }, language: "en" } })
    const extraction = await prisma.job.create({
      data: {
        prepId: prep.id, type: "concepts.extract", status: "running", heartbeatAt: new Date(Date.now() - STALE_HEARTBEAT_MS - 1000),
        model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: "u1",
        inputs: { create: [ { entityType: "prepImage", entityId: image.id } ] },
      },
    })

    expect((await post({ apiKey: API_KEY, prepId: prep.id, target: TARGET })).status).toBe(202)
    await runAfter()

    expect(h.ran).not.toContain("ocr")
    expect(h.ran.filter(type => type === "concepts.extract")).toHaveLength(1)
    expect(await prisma.job.count({ where: { prepId: prep.id, type: "concepts.extract" } })).toBe(1)
    expect((await prisma.job.findUniqueOrThrow({ where: { id: extraction.id } })).status).toBe("executed")
  })
})
