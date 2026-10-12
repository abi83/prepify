import { z, ZodSchema } from "zod"

import { NonRetryableLlmError, type AgentDeps, type LlmContentPart } from "@/core/ports"
import type { AgentMeta, Sampler } from "@/core/sampler"

import { serializeError } from "./logger"
import { computeCost } from "./pricing"
import { hashPrompt } from "./sampler/promptHash"

export type { AgentMeta }

export interface AgentResult<T> {
  output: T
  meta: AgentMeta
}

export const EMPTY_AGENT_META: AgentMeta = {
  model: "",
  tier: "",
  promptTokens: 0,
  cachedTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  toolCalls: 0,
  executionMs: 0,
}

export interface AgentImage {
  base64: string
  mimeType: string
}

export interface AgentInput {
  textContent: string
  images?: AgentImage[]
}

interface RunAgentConfig<T> {
  name: string
  systemPrompt: string
  userContent: AgentInput
  schema: ZodSchema<T>
  model?: string
  tier?: string
  signal: AbortSignal
  deps: AgentDeps
}

function buildUserContent({ textContent, images }: AgentInput): string | LlmContentPart[] {
  if (!images?.length) return textContent
  return [
    ...images.map(img => ({ type: "image" as const, mimeType: img.mimeType, base64: img.base64 })),
    { type: "text" as const, text: textContent },
  ]
}

// Strips characters that Postgres rejects in text/JSON columns:
// - C0 controls (0x00–0x1F) except tab, newline, carriage return
// - Lone UTF-16 surrogates (unpaired high or low surrogate code units)
export function sanitizeLLMText(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
}

const MAX_ATTEMPTS = 3

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffMs(attempt: number): number {
  // Exponential backoff with jitter — adapted from python-agents retry_decorator.py
  const base = Math.min(500 * Math.pow(1.2, attempt - 1), 8000)
  const jitter = 0.85 + Math.random() * 0.3
  return Math.round(base * jitter)
}

function describeFailure(err: unknown, timeoutMs: number): string {
  if (err instanceof Error && /timed out/i.test(err.message)) return `timed out after ${timeoutMs / 1000}s`
  return err instanceof Error ? err.message : String(err)
}

async function recordSample<T>(sampler: Sampler, config: RunAgentConfig<T>, output: T, meta: AgentMeta): Promise<void> {
  await sampler.record({
    executionId: crypto.randomUUID(),
    agent: config.name,
    systemPrompt: config.systemPrompt,
    promptHash: await hashPrompt(config.systemPrompt),
    input: { textContent: config.userContent.textContent, images: config.userContent.images ?? [] },
    output: z.json().parse(output),
    meta,
    timestamp: new Date().toISOString(),
  })
}

export async function runAgent<T>(config: RunAgentConfig<T>): Promise<AgentResult<T>> {
  const { name, systemPrompt, userContent, schema, model = "gpt-5-nano", tier = "flex", signal, deps } = config
  const { llm, logger, sampler, timeoutMs } = deps

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = performance.now()

    try {
      const response = await llm.complete(
        {
          model,
          tier,
          timeoutMs,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: buildUserContent(userContent) },
          ],
          responseFormat: { name, schema },
        },
        signal,
      )

      const executionMs = Math.round(performance.now() - t0)

      const rawText = sanitizeLLMText(response.content)
      const parsed = JSON.parse(rawText)

      // Zod validation — model is constrained to match the schema via Structured Outputs,
      // so this is a cheap type-safety assertion rather than a real fallback path.
      const validated = schema.parse(parsed)

      const { promptTokens, cachedTokens, completionTokens } = response

      const meta: AgentMeta = {
        model,
        tier,
        promptTokens,
        cachedTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costUsd: computeCost({ promptTokens, cachedTokens, completionTokens }, model, tier),
        toolCalls: 0,
        executionMs,
      }

      logger.debug(`agent:${name}`, meta as Record<string, unknown>)

      // A failed sample write must not fail the run.
      void recordSample(sampler, config, validated, meta).catch(e =>
        logger.warn(`agent:${name}: failed to record sample`, { error: serializeError(e) }))

      return { output: validated, meta }
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - t0)
      const retryable = !(err instanceof NonRetryableLlmError || (err instanceof Error && err.name === "AbortError"))
      logger.warn(`agent:${name}: attempt ${attempt}/${MAX_ATTEMPTS} failed${retryable ? "" : " (not retryable)"}`, {
        model, tier, attempt, timeoutMs, elapsedMs, error: serializeError(err),
      })
      lastError = err
      if (!retryable) throw err
      if (attempt < MAX_ATTEMPTS) {
        await delay(backoffMs(attempt))
      }
    }
  }

  throw new Error(`${name}: ${describeFailure(lastError, timeoutMs)} (attempt ${MAX_ATTEMPTS}/${MAX_ATTEMPTS})`)
}
