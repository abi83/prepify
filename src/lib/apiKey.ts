const STORAGE_KEY = 'prepify_api_key'

export interface ApiKeyConfig {
  provider: 'openai'
  model: string
  key: string
}

export function getApiKey(): ApiKeyConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ApiKeyConfig
  } catch {
    return null
  }
}

export function setApiKey(key: string): void {
  const config: ApiKeyConfig = { provider: 'openai', model: 'gpt-5-nano', key }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}
