import { mkdtemp, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it } from "vitest"

import { DEFAULT_CLI_CONFIG, loadCliConfig, resolveCliConfig, type CliConfigOverrides } from "@/cli/config"

async function writeConfig(content: string): Promise<string> {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "prepify-cfg-")), "config.yml")
  await writeFile(file, content)
  return file
}

describe("CLI config", () => {
  it("returns defaults for empty overrides", () => {
    expect(resolveCliConfig({})).toEqual(DEFAULT_CLI_CONFIG)
  })

  it("overrides per key and keeps the other defaults in the section", async () => {
    const config = await loadCliConfig(await writeConfig(`
llm:
  baseUrl: http://localhost:1234/v1
  model: google/gemma-4-26b-a4b
job:
  timeoutMs: 600000
run:
  concurrency: 1
target:
  questionCount: 3
`))

    expect(config.llm).toEqual({ baseUrl: "http://localhost:1234/v1", model: "google/gemma-4-26b-a4b", tier: "default" })
    expect(config.job).toEqual({ ...DEFAULT_CLI_CONFIG.job, timeoutMs: 600000 })
    expect(config.run).toEqual({ ...DEFAULT_CLI_CONFIG.run, concurrency: 1 })
    expect(config.target).toEqual({ ...DEFAULT_CLI_CONFIG.target, questionCount: 3 })
  })

  it("treats an empty file as no overrides", async () => {
    expect(await loadCliConfig(await writeConfig(""))).toEqual(DEFAULT_CLI_CONFIG)
  })

  it.each([
    [ "unknown key", { job: { timeout: 1 } } ],
    [ "unknown section", { network: {} } ],
    [ "non-positive timeout", { job: { timeoutMs: 0 } } ],
    [ "malformed url", { llm: { baseUrl: "localhost" } } ],
    [ "unknown question type", { target: { enabledTypes: [ "essay" ] } } ],
  ])("rejects %s", (_name, overrides) => {
    expect(() => resolveCliConfig(overrides as CliConfigOverrides)).toThrow()
  })

  it("rejects a file that is not a mapping", async () => {
    await expect(loadCliConfig(await writeConfig("- a\n- b\n"))).rejects.toThrow()
  })
})
