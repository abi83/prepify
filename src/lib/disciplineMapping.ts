import type { PrepDiscipline } from '@prisma/client'
import type { Discipline } from './agents/PrepLabeler'

/**
 * Prisma's generated enum values are identifier-safe ('SocialStudies'), while
 * app-facing code (LLM prompts, UI labels) uses the human-readable form
 * ('Social Studies') that the enum's `@map` stores in the DB.
 */
const DISCIPLINE_TO_ENUM: Record<Discipline, PrepDiscipline> = {
  'History': 'History',
  'Geography': 'Geography',
  'Literature': 'Literature',
  'Languages': 'Languages',
  'Social Studies': 'SocialStudies',
  'Economics': 'Economics',
  'Philosophy/Ethics': 'PhilosophyEthics',
  'Biology': 'Biology',
  'Chemistry': 'Chemistry',
  'Physics': 'Physics',
  'Mathematics': 'Mathematics',
  'Computer Science': 'ComputerScience',
}

const ENUM_TO_DISCIPLINE = Object.fromEntries(
  Object.entries(DISCIPLINE_TO_ENUM).map(([label, value]) => [value, label]),
) as Record<PrepDiscipline, Discipline>

export function disciplineToEnum(discipline: Discipline | null): PrepDiscipline | null {
  return discipline ? DISCIPLINE_TO_ENUM[discipline] : null
}

export function disciplineFromEnum(discipline: PrepDiscipline | null): Discipline | null {
  return discipline ? ENUM_TO_DISCIPLINE[discipline] : null
}
