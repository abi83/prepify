import { supabase } from './supabase'

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
  const { data, error } = await supabase.from('preps').select('tokens_used')
  if (error || !data) return 0
  return data.reduce((sum, row) => sum + (row.tokens_used ?? 0), 0)
}
