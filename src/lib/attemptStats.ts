import type { Attempt } from "@prisma/client"

export interface AttemptStats {
  count: number
  bestPct: number
  averagePct: number
  lastPct: number
  /** Last attempt minus the one before it, in points; null for a single attempt. */
  deltaPct: number | null
}

export const attemptPct = (a: Pick<Attempt, "score" | "total">) => Math.round((a.score / a.total) * 100)

/** `attempts` is newest first, as the repository returns it. */
export function summarizeAttempts(attempts: Attempt[]): AttemptStats {
  const [ last, previous ] = attempts
  if (!last) throw new Error("summarizeAttempts needs at least one attempt")
  const pcts = attempts.map(attemptPct)
  return {
    count: attempts.length,
    bestPct: Math.max(...pcts),
    averagePct: Math.round(pcts.reduce((sum, p) => sum + p, 0) / pcts.length),
    lastPct: attemptPct(last),
    deltaPct: previous ? attemptPct(last) - attemptPct(previous) : null,
  }
}
