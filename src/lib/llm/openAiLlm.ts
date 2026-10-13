import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"

import { NonRetryableLlmError, type Llm, type LlmMessage, type LlmRequest, type LlmResponse } from "@/core/ports"

const NON_RETRYABLE_STATUSES = [ 400, 401, 403 ]

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

/** `Llm` over the OpenAI chat-completions API (or any compatible `baseUrl`); safe to run in the browser. */
export class OpenAiLlm implements Llm {
  private readonly client: OpenAI

  constructor({ apiKey, baseUrl }: { apiKey: string; baseUrl?: string }) {
    // maxRetries: 0 — `runAgent`'s backoff loop is the only retry path; the SDK must not add a second one under it.
    this.client = new OpenAI({ apiKey, baseURL: baseUrl, dangerouslyAllowBrowser: true, maxRetries: 0 })
  }

  /** `false` when the provider rejects the key (401/403); any other failure throws. */
  async isKeyValid(): Promise<boolean> {
    try {
      await this.client.models.list()
      return true
    } catch (err) {
      if (err instanceof OpenAI.APIError && (err.status === 401 || err.status === 403)) return false
      throw err
    }
  }

  async complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: request.model,
          messages: request.messages.map(toOpenAiMessage),
          response_format: zodResponseFormat(request.responseFormat.schema, toSchemaName(request.responseFormat.name)),
          service_tier: request.tier as OpenAI.ChatCompletionCreateParams["service_tier"],
        },
        { signal, timeout: request.timeoutMs },
      )
      const usage = response.usage
      return {
        content: response.choices[0]?.message?.content ?? "",
        promptTokens: usage?.prompt_tokens ?? 0,
        cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
      }
    } catch (err) {
      if (err instanceof OpenAI.APIError && err.status !== undefined && NON_RETRYABLE_STATUSES.includes(err.status)) {
        throw new NonRetryableLlmError(err.message, err)
      }
      throw err
    }
  }
}
