const STORAGE_KEY = 'prepify_api_key'

export const AVAILABLE_MODELS = [
  { id: 'gpt-5-nano', label: 'GPT-5 Nano (fastest, cheapest)' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini (balanced)' },
  { id: 'gpt-5', label: 'GPT-5 (best quality)' },
] as const

export type ModelId = typeof AVAILABLE_MODELS[number]['id']

export interface ApiKeyConfig {
  provider: 'openai'
  model: ModelId
  key: string
}

export function getApiKey(): ApiKeyConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ApiKeyConfig>
    if (!parsed.key) return null
    return {
      provider: 'openai',
      model: (parsed.model ?? 'gpt-5-nano') as ModelId,
      key: parsed.key,
    }
  } catch {
    return null
  }
}

export function setApiKey(key: string, model: ModelId = 'gpt-5-nano'): void {
  const config: ApiKeyConfig = { provider: 'openai', model, key }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}
