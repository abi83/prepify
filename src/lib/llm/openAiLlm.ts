import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"

import { NonRetryableLlmError, type Llm, type LlmMessage, type LlmRequest, type LlmResponse } from "@/core/ports"

const NON_RETRYABLE_STATUSES = [ 400, 401, 403 ]

/** OpenAI's 401 carries no CORS headers, so in the browser a bad key surfaces as a status-less connection error. A real network drop looks identical. */
const INVALID_KEY_MESSAGE = "Request blocked or failed to connect — check your OpenAI API key in Settings"

function isBlockedConnection(err: unknown): boolean {
  return err instanceof OpenAI.APIConnectionError && !(err instanceof OpenAI.APIConnectionTimeoutError)
}

/** OpenAI accepts only `[a-zA-Z0-9_-]{1,64}` as a json_schema name. */
export function toSchemaName(label: string): string {
  const name = label.replace(/[^a-zA-Z0-9_-]/g, "_")
  if (name.length === 0 || name.length > 64) throw new Error(`Invalid response format name length (${name.length}): "${label}"`)
  return name
}

function toOpenAiMessage(message: LlmMessage): OpenAI.ChatCompletionMessageParam {
  if (typeof message.content === "string") return { role: message.role, content: message.content } as OpenAI.ChatCompletionMessageParam
  const parts = message.content.map((part): OpenAI.ChatCompletionContentPart =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.base64}`, detail: "high" } })
  return { role: "user", content: parts }
}

/** OpenAI's default; sent explicitly so a sample always records the value used. */
export const DEFAULT_TEMPERATURE = 1

/** `Llm` over the OpenAI chat-completions API (or any compatible `baseUrl`); safe to run in the browser. */
export class OpenAiLlm implements Llm {
  private readonly client: OpenAI
  private readonly temperature: number
  private readonly maxTokensOverride: number | undefined
  private readonly capParam: "max_tokens" | "max_completion_tokens"

  /** `maxTokensOverride` replaces every request's `maxTokens`; the response reports the value actually sent. */
  constructor({ apiKey, baseUrl, temperature = DEFAULT_TEMPERATURE, maxTokens }: { apiKey: string; baseUrl?: string; temperature?: number; maxTokens?: number }) {
    this.temperature = temperature
    this.maxTokensOverride = maxTokens
    // OpenAI's newer models reject `max_tokens`; OpenAI-compatible local servers (LM Studio) document only `max_tokens`.
    this.capParam = baseUrl === undefined ? "max_completion_tokens" : "max_tokens"
    // maxRetries: 0 — `runAgent`'s backoff loop is the only retry path; the SDK must not add a second one under it.
    this.client = new OpenAI({ apiKey, baseURL: baseUrl, dangerouslyAllowBrowser: true, maxRetries: 0 })
  }

  /** `false` when the provider rejects the key (401/403, or a CORS-blocked 401); any other failure throws. */
  async isKeyValid(): Promise<boolean> {
    try {
      await this.client.models.list()
      return true
    } catch (err) {
      if (err instanceof OpenAI.APIError && (err.status === 401 || err.status === 403)) return false
      if (isBlockedConnection(err)) return false
      throw err
    }
  }

  async complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    const maxTokens = this.maxTokensOverride ?? request.maxTokens
    try {
      const response = await this.client.chat.completions.create(
        {
          model: request.model,
          messages: request.messages.map(toOpenAiMessage),
          response_format: zodResponseFormat(request.responseFormat.schema, toSchemaName(request.responseFormat.name)),
          service_tier: request.tier as OpenAI.ChatCompletionCreateParams["service_tier"],
          temperature: this.temperature,
          [this.capParam]: maxTokens,
        },
        { signal, timeout: request.timeoutMs },
      )
      if (response.choices[0]?.finish_reason === "length") throw new NonRetryableLlmError(`completion hit max tokens (${maxTokens})`)
      const usage = response.usage
      return {
        content: response.choices[0]?.message?.content ?? "",
        promptTokens: usage?.prompt_tokens ?? 0,
        cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        temperature: this.temperature,
        maxTokens,
      }
    } catch (err) {
      if (err instanceof OpenAI.APIError && err.status !== undefined && NON_RETRYABLE_STATUSES.includes(err.status)) {
        throw new NonRetryableLlmError(err.message, err)
      }
      if (isBlockedConnection(err)) throw new NonRetryableLlmError(INVALID_KEY_MESSAGE, err)
      throw err
    }
  }
}
