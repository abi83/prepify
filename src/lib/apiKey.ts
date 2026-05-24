const STORAGE_KEY = 'prepify_api_key'

export const AVAILABLE_MODELS = [
  { id: 'gpt-5-nano', label: 'GPT-5 Nano (fastest, cheapest)' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini (balanced)' },
  { id: 'gpt-5', label: 'GPT-5 (best quality)' },
] as const

/**
 * OpenAI Flex-tier pricing (USD per 1 million tokens).
 * Source: https://developers.openai.com/api/docs/pricing?latest-pricing=flex
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5-nano':  { input: 1.10,  output: 4.40  },
  'gpt-5-mini':  { input: 1.10,  output: 4.40  },
  'gpt-5':       { input: 15.00, output: 60.00 },
}

/** Returns estimated USD cost for the given token counts and model. */
export function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-5-nano']
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

/** Formats a USD cost value for display, e.g. "$0.0023" or "< $0.01". */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.001) return '< $0.001'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

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
