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
 * recorded as GenerationMeta rows against the newly created question's id in the same transaction.
 * Omit it to insert plain questions with no usage tracking (e.g. imports, tests).
 */
export async function insertMany(
  userId: string,
  prepId: string,
  questions: CreateQuestionInput[],
  questionMeta?: AgentMeta[][],
): Promise<Question[]> {
  const prep = await getPrep(userId, prepId)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)

  if (!questionMeta) {
    await prisma.question.createMany({
      data: questions.map(q => ({ prepId, type: q.type, content: q.content })),
    })
    return prisma.question.findMany({ where: { prepId }, orderBy: { createdAt: "asc" } })
  }

  return prisma.$transaction(async (tx) => {
    const created: Question[] = []
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const question = await tx.question.create({ data: { prepId, type: q.type, content: q.content } })
      created.push(question)

      const metas = (questionMeta[i] ?? []).filter(m => m.promptTokens + m.completionTokens + m.cachedTokens > 0)
      for (const m of metas) {
        await tx.generationMeta.create({ data: toGenerationMeta("question", question.id, m) })
      }
    }
    return created
  })
}
