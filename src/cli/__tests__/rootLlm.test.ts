import { mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it, vi } from "vitest"

import { resolveCliConfig } from "@/cli/config"
import { runCli } from "@/cli/root"

const constructed = vi.hoisted(() => vi.fn())

vi.mock("@/lib/llm/openAiLlm", () => ({
  OpenAiLlm: class {
    constructor(args: unknown) { constructed(args) }
    complete(): never { throw new Error("stop") }
  },
}))

describe("CLI root llm settings", () => {
  it("passes baseUrl, temperature and maxTokens to OpenAiLlm", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prepify-cli-"))
    const config = resolveCliConfig({ llm: { baseUrl: "http://localhost:1234/v1", temperature: 0.3, maxTokens: 2048 } })

    await runCli({ prepDir: dir, samplesRoot: `${dir}-samples`, apiKey: "unused", config }).catch(() => {})

    expect(constructed).toHaveBeenCalledWith({ apiKey: "unused", baseUrl: "http://localhost:1234/v1", temperature: 0.3, maxTokens: 2048 })
  })
})
