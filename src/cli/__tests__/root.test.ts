import { mkdir, mkdtemp, readFile, readdir, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it } from "vitest"

import { createFilePrep } from "@/cli/filePrep"
import { runCli } from "@/cli/root"
import type { Job } from "@/core/job"
import type { Llm, LlmRequest } from "@/core/ports"
import { DEFAULT_GEN_CONFIG } from "@/lib/generationConfig"

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="

const METRIC = { score: 1, comment: "ok" }
const RESPONSES: Record<string, unknown> = {
  ocr: { text: "Mitosis is the division of a cell nucleus into two identical nuclei.", confidence: 0.9, language: "en", visual_elements: [] },
  ConceptExtractor: {
    concepts: [ { name: "Mitosis", description: "Division of a cell nucleus into two identical daughter nuclei.", importance: 0.9, misconceptions: [] } ],
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
      return { content: JSON.stringify(RESPONSES[name]), promptTokens: 1, cachedTokens: 0, completionTokens: 1 }
    },
  }
}

async function makePrepFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "prepify-cli-"))
  await mkdir(path.join(dir, "images"))
  await writeFile(path.join(dir, "images", "page-1.png"), Buffer.from(PNG_1X1, "base64"))
  return dir
}

const options = (prepDir: string, llm: Llm) => ({
  prepDir,
  model: "local-model",
  tier: "default",
  apiKey: "unused",
  llm,
  target: { ...DEFAULT_GEN_CONFIG, questionCount: 1, enabledTypes: [ "flashcard" as const ] },
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
    expect((await readdir(path.join(dir, "samples"), { recursive: true })).length).toBeGreaterThan(0)
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
})
