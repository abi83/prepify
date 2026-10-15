import type { Question } from "@prisma/client"

import { prisma } from "@/lib/prisma"

import { ForbiddenError, NotFoundError } from "./errors"
import { getPrep } from "./prepRepository"

export async function listByPrep(userId: string | null, prepId: string): Promise<Question[]> {
  await getPrep(userId, prepId) // throws NotFoundError/ForbiddenError if not readable
  return prisma.question.findMany({ where: { prepId }, orderBy: { createdAt: "asc" } })
}

export async function getOwned(userId: string, prepId: string, questionId: string): Promise<Question> {
  const prep = await getPrep(userId, prepId)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)
  const question = await prisma.question.findUnique({ where: { id: questionId } })
  if (!question || question.prepId !== prepId) throw new NotFoundError(`Question ${questionId} not found in prep ${prepId}`)
  return question
}
