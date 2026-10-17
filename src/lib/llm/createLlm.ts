import type { Llm } from "@/core/ports"

import { GeminiLlm } from "./geminiLlm"
import { OpenAiLlm } from "./openAiLlm"
import type { Provider } from "./provider"

export type ByokLlm = Llm & { isKeyValid(): Promise<boolean> }

export function createLlm(provider: Provider, apiKey: string): ByokLlm {
  return provider === "gemini" ? new GeminiLlm({ apiKey }) : new OpenAiLlm({ apiKey })
}
