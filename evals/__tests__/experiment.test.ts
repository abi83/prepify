import { mkdtemp, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it } from "vitest"

import { loadExperiment } from "@evals/experiment"

const YAML = `cell:
  agent: ocr
  promptHash: ${"a".repeat(64)}
  model: gpt-5-mini
samplesDir: ./samples
judge:
  llm: { model: big, tier: default }
  timeoutMs: 60000
  concurrency: 4
outputDir: ./out
`

async function load(content: string) {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "prepify-exp-")), "exp.yml")
  await writeFile(file, content)
  return loadExperiment(file)
}

describe("loadExperiment", () => {
  it("parses a valid experiment", async () => {
    expect((await load(YAML)).judge.llm.baseUrl).toBeUndefined()
  })

  it("rejects unknown keys and bad values", async () => {
    await expect(load(YAML + "extra: 1\n")).rejects.toThrow()
    await expect(load(YAML.replace("timeoutMs: 60000", "timeoutMs: 0"))).rejects.toThrow()
    await expect(load(YAML.replace("  concurrency: 4\n", ""))).rejects.toThrow()
    for (const bad of [ "0", "-1", "1.5", "\"2\"" ]) await expect(load(YAML.replace("concurrency: 4", `concurrency: ${bad}`))).rejects.toThrow()
    await expect(load(YAML.replace("a".repeat(64), "abc"))).rejects.toThrow()
  })
})
