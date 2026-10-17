import { difficultySchema, type Difficulty } from "@/types/questions"

export const DIFFICULTY_TIERS: Difficulty[] = [ "easy", "medium", "hard" ]

const STYLES: Record<Difficulty, string> = {
  easy: "border-green-600/40 text-green-700 dark:text-green-400",
  medium: "border-amber-600/40 text-amber-700 dark:text-amber-400",
  hard: "border-red-600/40 text-red-700 dark:text-red-400",
}

/** Label for a question's difficulty; legacy rows without one render nothing. */
export default function DifficultyBadge({ difficulty }: { difficulty: string | null }) {
  if (difficulty === null) return null
  const tier = difficultySchema.parse(difficulty)
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STYLES[tier]}`}>{tier}</span>
}

/** Per-tier question counts, in tier order; legacy rows without a difficulty are excluded. */
export function countByDifficulty(questions: { difficulty: string | null }[]): Record<Difficulty, number> {
  const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const { difficulty } of questions) {
    if (difficulty !== null) counts[difficultySchema.parse(difficulty)]++
  }
  return counts
}
