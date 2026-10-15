const STORAGE_KEY = "prepify_api_key"

export const DEFAULT_MODEL = "gpt-5-nano"
export const DEFAULT_TIER = "flex"

export interface ApiKeyConfig {
  provider: "openai"
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
    return {
      provider: "openai",
      model: parsed.model ?? DEFAULT_MODEL,
      tier: parsed.tier ?? DEFAULT_TIER,
      key: parsed.key,
    }
  } catch {
    return null
  }
}

export function setApiKey(key: string, model = DEFAULT_MODEL, tier = DEFAULT_TIER): void {
  const config: ApiKeyConfig = { provider: "openai", model, tier, key }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}
