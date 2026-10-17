import { ApiError, FinishReason, GoogleGenAI, ServiceTier, type Content, type Part } from "@google/genai"
import { z } from "zod"

import { NonRetryableLlmError, type Llm, type LlmMessage, type LlmRequest, type LlmResponse } from "@/core/ports"

/** Gemini reports a malformed key as 400 `API_KEY_INVALID`, not 401. */
const NON_RETRYABLE_STATUSES = [ 400, 401, 403 ]

/** Gemini's default; sent explicitly so a sample always records the value used. */
export const DEFAULT_TEMPERATURE = 1

function toParts(message: LlmMessage): Part[] {
  if (typeof message.content === "string") return [ { text: message.content } ]
  return message.content.map((part): Part =>
    part.type === "text" ? { text: part.text } : { inlineData: { mimeType: part.mimeType, data: part.base64 } })
}

/** System messages go to `systemInstruction`; the rest are user turns. */
function splitMessages(messages: LlmMessage[]): { system: Content | undefined; contents: Content[] } {
  const system = messages.filter(m => m.role === "system").flatMap(toParts)
  const contents = messages.filter(m => m.role === "user").map((m): Content => ({ role: "user", parts: toParts(m) }))
  return { system: system.length > 0 ? { parts: system } : undefined, contents }
}

/** Our `default` tier is Gemini's `standard`; other tier ids pass through. */
function toServiceTier(tier: string): ServiceTier {
  return tier === "default" ? ServiceTier.STANDARD : tier as ServiceTier
}

/** `Llm` over the Gemini API; safe to run in the browser. */
export class GeminiLlm implements Llm {
  private readonly client: GoogleGenAI

  constructor({ apiKey }: { apiKey: string }) {
    this.client = new GoogleGenAI({ apiKey })
  }

  /** `false` when the provider rejects the key; any other failure throws. */
  async isKeyValid(): Promise<boolean> {
    try {
      await this.client.models.list({ config: { pageSize: 1 } })
      return true
    } catch (err) {
      if (err instanceof ApiError && NON_RETRYABLE_STATUSES.includes(err.status)) return false
      throw err
    }
  }

  async complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    const { system, contents } = splitMessages(request.messages)
    try {
      const response = await this.client.models.generateContent({
        model: request.model,
        contents,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(request.responseFormat.schema),
          serviceTier: toServiceTier(request.tier),
          temperature: DEFAULT_TEMPERATURE,
          // Thinking tokens count against this cap.
          maxOutputTokens: request.maxTokens,
          abortSignal: signal,
          httpOptions: { timeout: request.timeoutMs },
        },
      })
      if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
        throw new NonRetryableLlmError(`completion hit max tokens (${request.maxTokens})`)
      }
      const usage = response.usageMetadata
      return {
        content: response.text ?? "",
        promptTokens: usage?.promptTokenCount ?? 0,
        cachedTokens: usage?.cachedContentTokenCount ?? 0,
        // Thinking tokens are billed as output.
        completionTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: request.maxTokens,
      }
    } catch (err) {
      if (err instanceof ApiError && NON_RETRYABLE_STATUSES.includes(err.status)) throw new NonRetryableLlmError(err.message, err)
      throw err
    }
  }
}
