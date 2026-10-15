import { mkdir, mkdtemp, readFile, readdir, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it } from "vitest"

import { resolveCliConfig } from "@/cli/config"
import { createFilePrep } from "@/cli/filePrep"
import { createCliJobs, runCli, runCliJobs } from "@/cli/root"
import type { Job } from "@/core/job"
import type { Llm, LlmRequest } from "@/core/ports"

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="

const METRIC = { score: 1, comment: "ok" }
const RESPONSES: Record<string, unknown> = {
  ocr: { text: "Mitosis is the division of a cell nucleus into two identical nuclei.", confidence: 0.9, language: "en", visual_elements: [] },
  ConceptExtractor: {
    concepts: [ { name: "Mitosis", description: "Division of a cell nucleus into two identical daughter nuclei.", importance: 0.9, misconceptions: [] } ],
    emptyReason: null,
  },
  PrepNamer: { title: "Mitosis Basics", description: "Covers mitosis, the process by which a cell nucleus divides into two identical daughter nuclei." },
  PrepLabeler: { grade: 9, discipline: "Biology", confidence: 0.9 },
  FlashcardBuilder: {
    content: { front: "Which process splits a nucleus into two identical nuclei?", back: "Mitosis", back_explanation: "Mitosis yields identical daughter nuclei.", asset_hint: { needed: false, type: null, description: null } },
  },
  QuestionReviewer: {
    scores: { correctness: METRIC, conceptAlignment: METRIC, clarity: METRIC, cognitiveDemand: METRIC, distractorQuality: null },
    comment: "ok",
  },
}

function fakeLlm(calls: string[] = []): Llm {
  return {
    async complete(request: LlmRequest) {
      const { name } = request.responseFormat
      calls.push(name)
      if (!(name in RESPONSES)) throw new Error(`Unexpected agent "${name}"`)
      return { content: JSON.stringify(RESPONSES[name]), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 32_000 }
    },
  }
}

async function makePrepFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "prepify-cli-"))
  await mkdir(path.join(dir, "images"))
  await writeFile(path.join(dir, "images", "page-1.png"), Buffer.from(PNG_1X1, "base64"))
  return dir
}

const samplesRootOf = (prepDir: string) => `${prepDir}-samples-root`

const options = (prepDir: string, llm: Llm) => ({
  prepDir,
  samplesRoot: samplesRootOf(prepDir),
  apiKey: "unused",
  llm,
  config: resolveCliConfig({ llm: { model: "google/gemma-4-26b-a4b" }, target: { questionCount: 1, enabledTypes: [ "flashcard" ] } }),
})

describe("CLI root", () => {
  it("runs OCR → concepts → meta → questions on a prep directory with a fake Llm", async () => {
    const dir = await makePrepFixture()
    const calls: string[] = []

    await runCli(options(dir, fakeLlm(calls)))

    expect(calls[0]).toBe("ocr")
    expect(calls).toEqual(expect.arrayContaining([ "ConceptExtractor", "PrepNamer", "PrepLabeler", "FlashcardBuilder", "QuestionReviewer" ]))
    expect(await createFilePrep(dir).data.loadState("p")).toMatchObject({
      images: [ { id: "page-1", ocrDone: true } ],
      concepts: [ { name: "Mitosis" } ],
      prepMetaDone: true,
      questionCount: 1,
    })
    expect(await readFile(path.join(dir, "logs", "run.log"), "utf-8")).not.toBe("")
    const files = (await readdir(path.join(samplesRootOf(dir), "samples"), { recursive: true })).filter((f) => f.endsWith(".json"))
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((f) => f.startsWith(path.join("ocr", "")))).toBe(true)
    expect(await readdir(dir)).not.toContain("samples")
  })

  it("logs attempt starts at the default debug level", async () => {
    const dir = await makePrepFixture()

    await runCli(options(dir, fakeLlm()))

    expect(await readFile(path.join(dir, "logs", "run.log"), "utf-8")).toContain("attempt 1/3 started")
  })

  it("writes no log below the configured log.level", async () => {
    const dir = await makePrepFixture()
    const config = resolveCliConfig({ log: { level: "error" }, target: { questionCount: 1, enabledTypes: [ "flashcard" ] } })

    await runCli({ ...options(dir, fakeLlm()), config })

    expect(await readdir(dir, { recursive: true })).not.toContain(path.join("logs", "run.log"))
  })

  it("resumes a failed job on rerun", async () => {
    const dir = await makePrepFixture()
    const failing: Llm = { complete: () => { throw new Error("endpoint down") } }
    await expect(runCli(options(dir, failing))).rejects.toThrow()

    const prep = createFilePrep(dir)
    expect((await prep.listUnfinishedJobs("cli", "p")).map((job: Job) => job.type)).toEqual([ "ocr" ])

    await runCli(options(dir, fakeLlm()))

    expect(await prep.listUnfinishedJobs("cli", "p")).toEqual([])
    expect((await prep.data.loadState("p")).questionCount).toBe(1)
  })

  it("creates OCR jobs without calling the Llm, then runs them by id", async () => {
    const dir = await makePrepFixture()
    const calls: string[] = []
    const opts = options(dir, fakeLlm(calls))

    const created = await createCliJobs(opts)

    expect(calls).toEqual([])
    expect(created).toMatchObject([ { type: "ocr", status: "created", config: { model: "google/gemma-4-26b-a4b" } } ])

    await runCliJobs({ ...opts, jobIds: [ created[0].id ] })

    expect(calls).toEqual([ "ocr" ])
    expect(await createFilePrep(dir).data.loadState("p")).toMatchObject({ images: [ { id: "page-1", ocrDone: true } ], concepts: [] })
  })

  it("stops with the reason, without replanning, when no page yields concepts", async () => {
    const dir = await makePrepFixture()
    const calls: string[] = []
    const base = fakeLlm(calls)
    const noConcepts: Llm = {
      async complete(request, signal) {
        if (request.responseFormat.name !== "ConceptExtractor") return base.complete(request, signal)
        calls.push("ConceptExtractor")
        return { content: JSON.stringify({ concepts: [], emptyReason: "not_educational" }), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 32_000 }
      },
    }

    await expect(runCli(options(dir, noConcepts))).rejects.toThrow("No concepts found in any page (not_educational)")
    await expect(runCli(options(dir, noConcepts))).rejects.toThrow("No concepts found in any page (not_educational)")

    expect(calls.filter(name => name === "ConceptExtractor")).toHaveLength(1)
    expect(calls).not.toContain("PrepNamer")
  })

  it("fails a concepts.extract job whose input image has no OCR language", async () => {
    const dir = await makePrepFixture()
    const prep = createFilePrep(dir)
    await prep.store.createJob("cli", "concepts.extract", [ "page-1" ], { model: "m", tier: "default", timeoutMs: 1000, maxRetries: 0 })

    await expect(runCliJobs({ ...options(dir, fakeLlm()), jobIds: [] })).rejects.toThrow("has no language")
  })
})
