import { isProvider, PROVIDER_INFO, type Provider } from "@/lib/llm/provider"

const STORAGE_KEY = "prepify_api_key"

export interface ApiKeyConfig {
  provider: Provider
  model: string
  tier: string
  key: string
}

export function getApiKey(): ApiKeyConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ApiKeyConfig>
    if (!parsed.key) return null
    // Configs saved before Gemini support have no provider.
    const provider = parsed.provider ?? "openai"
    if (!isProvider(provider)) return null
    return {
      provider,
      model: parsed.model ?? PROVIDER_INFO[provider].defaultModel,
      tier: parsed.tier ?? PROVIDER_INFO[provider].defaultTier,
      key: parsed.key,
    }
  } catch {
    return null
  }
}

export function setApiKey(config: ApiKeyConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}
