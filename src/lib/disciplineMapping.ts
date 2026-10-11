import type { PrepDisciplineId } from "@/types/prep"

import type { Discipline } from "./agents/PrepLabeler"

/**
 * Prisma's generated enum values are identifier-safe ('SocialStudies'), while
 * app-facing code (LLM prompts, UI labels) uses the human-readable form
 * ('Social Studies') that the enum's `@map` stores in the DB.
 */
const DISCIPLINE_TO_ENUM: Record<Discipline, PrepDisciplineId> = {
  "History": "History",
  "Geography": "Geography",
  "Literature": "Literature",
  "Social Studies": "SocialStudies",
  "Economics": "Economics",
  "Philosophy/Ethics": "PhilosophyEthics",
  "Biology": "Biology",
  "Chemistry": "Chemistry",
  "Physics": "Physics",
  "Mathematics": "Mathematics",
  "Computer Science": "ComputerScience",
  "English": "English",
  "French": "French",
  "German": "German",
  "Spanish": "Spanish",
  "Italian": "Italian",
  "Latin": "Latin",
  "Russian": "Russian",
}

const ENUM_TO_DISCIPLINE = Object.fromEntries(
  Object.entries(DISCIPLINE_TO_ENUM).map(([ label, value ]) => [ value, label ]),
) as Record<PrepDisciplineId, Discipline>

export function disciplineToEnum(discipline: Discipline | null): PrepDisciplineId | null {
  return discipline ? DISCIPLINE_TO_ENUM[discipline] : null
}

export function disciplineFromEnum(discipline: PrepDisciplineId | null): Discipline | null {
  return discipline ? ENUM_TO_DISCIPLINE[discipline] : null
}
