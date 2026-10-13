import { mkdir, writeFile } from "fs/promises"
import path from "path"

import type { StoredSample } from "@/core/sampler"
import { cellPrefix } from "@/lib/sampler/storedSample"

export const PROMPT_HASH = "a".repeat(64)
export const CELL = { agent: "ocr", promptHash: PROMPT_HASH, model: "org/model-x" }

export function makeSample(n: number, overrides: Partial<StoredSample> = {}): StoredSample {
  return {
    executionId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    agent: CELL.agent,
    systemPrompt: "ocr prompt",
    promptHash: PROMPT_HASH,
    input: { textContent: "Extract text", images: [ { base64: "AAAA", mimeType: "image/png" } ] },
    output: { text: `page ${n}`, confidence: 0.9, language: "en", visual_elements: [] },
    meta: {
      model: CELL.model, tier: "default", temperature: 1, maxTokens: 32_000, promptTokens: 100 * n, cachedTokens: 0, completionTokens: 10 * n,
      totalTokens: 110 * n, costUsd: 0.001 * n, toolCalls: 0, executionMs: 1000 * n,
    },
    timestamp: "2026-01-01T00:00:00.000Z",
    appVersion: "test",
    ...overrides,
  }
}

export async function writeSamples(dir: string, samples: object[]): Promise<void> {
  const cellDir = path.join(dir, cellPrefix(CELL))
  await mkdir(cellDir, { recursive: true })
  await Promise.all(samples.map((s, i) => writeFile(path.join(cellDir, `${i}.json`), JSON.stringify(s))))
}
