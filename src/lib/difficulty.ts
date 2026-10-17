export const DIFFICULTIES = [ "easy", "medium", "hard" ] as const

export type Difficulty = (typeof DIFFICULTIES)[number]

export function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.some(d => d === value)
}
