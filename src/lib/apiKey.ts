const STORAGE_KEY = 'prepify_api_key'

export const AVAILABLE_MODELS = [
  { id: 'gpt-5-nano', label: 'GPT-5 Nano (fastest, cheapest)' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini (balanced)' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (newest, cheap)' },
] as const

export const AVAILABLE_TIERS = [
  { id: 'standard', label: 'Standard' },
  { id: 'flex', label: 'Flex (cheaper, slower)' },
] as const

export type ModelId = typeof AVAILABLE_MODELS[number]['id']
export type TierId = typeof AVAILABLE_TIERS[number]['id']

interface TierPricing {
  /** USD per 1M uncached input tokens. */
  input: number
  /** USD per 1M cache-hit input tokens (a repeated prompt prefix OpenAI served from cache). */
  cachedInput: number
  /** USD per 1M output tokens. */
  output: number
}

/**
 * OpenAI pricing (USD per 1M tokens, short-context only — the pipeline never
 * sends long-context requests, see agent.ts).
 * Source: https://developers.openai.com/api/docs/pricing
 */
export const MODEL_PRICING: Record<ModelId, Record<TierId, TierPricing>> = {
  'gpt-5-nano': {
    standard: { input: 0.05, cachedInput: 0.005, output: 0.40 },
    flex: { input: 0.025, cachedInput: 0.0025, output: 0.20 },
  },
  'gpt-5-mini': {
    standard: { input: 0.25, cachedInput: 0.025, output: 2.00 },
    flex: { input: 0.125, cachedInput: 0.0125, output: 1.00 },
  },
  'gpt-5.6-luna': {
    standard: { input: 0.20, cachedInput: 0.02, output: 1.20 },
    flex: { input: 0.10, cachedInput: 0.01, output: 0.60 },
  },
}

/** Returns estimated USD cost for the given token counts, model and tier. */
export function estimateCost(
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  model: ModelId,
  tier: TierId,
): number {
  const pricing = MODEL_PRICING[model][tier]
  const uncachedInput = inputTokens - cachedInputTokens
  return (
    uncachedInput * pricing.input +
    cachedInputTokens * pricing.cachedInput +
    outputTokens * pricing.output
  ) / 1_000_000
}

/** Formats a USD cost value for display, e.g. "$0.0023" or "< $0.01". */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.001) return '< $0.001'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

export interface ApiKeyConfig {
  provider: 'openai'
  model: ModelId
  tier: TierId
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
      tier: (parsed.tier ?? 'flex') as TierId,
      key: parsed.key,
    }
  } catch {
    return null
  }
}

export function setApiKey(key: string, model: ModelId = 'gpt-5-nano', tier: TierId = 'flex'): void {
  const config: ApiKeyConfig = { provider: 'openai', model, tier, key }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}
