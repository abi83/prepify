import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z, ZodSchema } from "zod"

import { AGENT_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUT_MS } from "./config"
import type { Logger } from "./logger"
import { serializeError } from "./logger"
import { computeCost } from "./pricing"
import { hashPrompt } from "./sampler/promptHash"
import type { Sampler } from "./sampler/schema"

/**
 * App-shaped usage/cost data for one agent call — never OpenAI's raw `usage` object.
 * This is what gets persisted as a `GenerationMeta` row (see src/types/generationMeta.ts)
 * and what callers use for progress/cost display. Nothing downstream of `runAgent`
 * should read an OpenAI response shape directly.
 */
export const agentMetaSchema = z.object({
  model: z.string(),
  tier: z.string(),
  promptTokens: z.number(),
  cachedTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  costUsd: z.number(),
  toolCalls: z.number(),
  executionMs: z.number(),
})

export type AgentMeta = z.infer<typeof agentMetaSchema>

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
  apiKey: string
  model?: string
  tier?: string
  signal: AbortSignal
  logger: Logger
  sampler: Sampler
}

function buildUserContent({ textContent, images }: AgentInput): string | OpenAI.ChatCompletionContentPart[] {
  if (!images?.length) return textContent
  return [
    ...images.map(img => ({
      type: "image_url" as const,
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" as const },
    })),
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

function isNonRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    return err.status === 400 || err.status === 401 || err.status === 403
  }
  return false
}

async function recordSample<T>(config: RunAgentConfig<T>, output: T, meta: AgentMeta): Promise<void> {
  await config.sampler.record({
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
  const { name, systemPrompt, userContent, schema, apiKey, model = "gpt-5-nano", tier = "flex", signal } = config

  const timeout = AGENT_TIMEOUT_MS[name] ?? DEFAULT_AGENT_TIMEOUT_MS
  // maxRetries: 0 — the backoff loop below is the only retry path; the SDK must not add a second one under it.
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, timeout, maxRetries: 0 })

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = performance.now()

    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: buildUserContent(userContent) },
          ],
          response_format: zodResponseFormat(schema, config.name),
          service_tier: tier as OpenAI.ChatCompletionCreateParams["service_tier"],
        },
        { signal }
      )

      const executionMs = Math.round(performance.now() - t0)
      const usage = response.usage
      const message = response.choices[0]?.message

      const rawText = sanitizeLLMText(message?.content ?? "")
      const parsed = JSON.parse(rawText)

      // Zod validation — model is constrained to match the schema via Structured Outputs,
      // so this is a cheap type-safety assertion rather than a real fallback path.
      const validated = schema.parse(parsed)

      const promptTokens = usage?.prompt_tokens ?? 0
      const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0
      const completionTokens = usage?.completion_tokens ?? 0

      const meta: AgentMeta = {
        model,
        tier,
        promptTokens,
        cachedTokens,
        completionTokens,
        totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
        costUsd: computeCost({ promptTokens, cachedTokens, completionTokens }, model, tier),
        toolCalls: message?.tool_calls?.length ?? 0,
        executionMs,
      }

      config.logger.debug(`agent:${name}`, meta as Record<string, unknown>)

      // A failed sample write must not fail the run.
      void recordSample(config, validated, meta).catch(e =>
        config.logger.warn(`agent:${name}: failed to record sample`, { error: serializeError(e) }))

      return { output: validated, meta }
    } catch (err) {
      lastError = err
      if (isNonRetryable(err) || (err instanceof Error && err.name === "AbortError")) {
        throw err
      }
      if (attempt < MAX_ATTEMPTS) {
        await delay(backoffMs(attempt))
      }
    }
  }

  throw lastError
}
