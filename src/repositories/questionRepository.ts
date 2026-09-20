import { randomUUID } from "node:crypto"

import { Prisma, type Question } from "@prisma/client"

import { ForbiddenError } from "./errors"
import { getPrep } from "./prepRepository"
import type { AgentMeta } from "../lib/agent"
import { prisma } from "../lib/prisma"
import { toGenerationMeta } from "../types/generationMeta"

export async function listByPrep(userId: string | null, prepId: string): Promise<Question[]> {
  await getPrep(userId, prepId) // throws NotFoundError/ForbiddenError if not readable
  return prisma.question.findMany({ where: { prepId }, orderBy: { createdAt: "asc" } })
}

export interface CreateQuestionInput {
  type: string
  content: Prisma.InputJsonValue
}

/**
 * `questionMeta[i]`, when given, are the build/review(/retry) agent calls behind `questions[i]` —
 * recorded as GenerationMeta rows against the newly created question's id. Omit it to insert
 * plain questions with no usage tracking (e.g. imports, tests). When given, its length must
 * match `questions` — the two are matched by array position, so a mismatch means the caller's
 * data is already out of sync and inserting would silently attach metas to the wrong question.
 *
 * Ids are generated up front so the questions and their GenerationMeta rows can each be written
 * in a single `createMany` — a per-question loop of individual `create` calls doesn't scale to
 * large batches within Prisma's interactive-transaction timeout.
 */
export async function insertMany(
  userId: string,
  prepId: string,
  questions: CreateQuestionInput[],
  questionMeta?: AgentMeta[][],
): Promise<Question[]> {
  const prep = await getPrep(userId, prepId)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)

  if (questionMeta && questionMeta.length !== questions.length) {
    throw new Error(`questionMeta length (${questionMeta.length}) does not match questions length (${questions.length})`)
  }

  const ids = questions.map(() => randomUUID())

  await prisma.$transaction([
    prisma.question.createMany({
      data: questions.map((q, i) => ({ id: ids[i], prepId, type: q.type, content: q.content })),
    }),
    ...(questionMeta
      ? [ prisma.generationMeta.createMany({
        data: questions.flatMap((_, i) =>
          questionMeta[i]
            .filter(m => m.promptTokens + m.completionTokens + m.cachedTokens > 0)
            .map(m => toGenerationMeta("question", ids[i], m))
        ),
      }) ]
      : []),
  ])

  return prisma.question.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" } })
}
