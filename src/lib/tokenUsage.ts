import { supabase } from './supabase'

const STORAGE_KEY = 'prepify_token_usage'

interface TokenUsage {
  total_tokens: number
}

function read(): TokenUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { total_tokens: 0 }
    return JSON.parse(raw) as TokenUsage
  } catch {
    return { total_tokens: 0 }
  }
}

export function addTokenUsage(tokens: number): void {
  const current = read()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ total_tokens: current.total_tokens + tokens }))
}

export function getTotalTokens(): number {
  return read().total_tokens
}

export function clearTokenUsage(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Atomically increments tokens_used for a prep in Supabase.
 * Fire-and-forget safe — errors are logged but not thrown.
 */
export async function incrementPrepTokensInDb(prepId: string, delta: number): Promise<void> {
  if (delta <= 0) return
  const { error } = await supabase.rpc('increment_prep_tokens', {
    p_prep_id: prepId,
    p_delta: delta,
  })
  if (error) console.warn('[tokenUsage] DB increment failed:', error.message)
}

/** Returns the sum of tokens_used across all preps for the current user. */
export async function getTotalTokensFromDb(): Promise<number> {
  const { data, error } = await supabase
    .from('preps')
    .select('tokens_used')
  if (error || !data) return getTotalTokens()
  const total = data.reduce((sum, row) => sum + (row.tokens_used ?? 0), 0)
  // Keep localStorage in sync as a fast-read cache
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ total_tokens: total }))
  return total
}
