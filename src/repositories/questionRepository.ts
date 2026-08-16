import { Prisma, type Question } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ForbiddenError } from './errors'
import { getPrep } from './prepRepository'

export async function listByPrep(userId: string | null, prepId: string): Promise<Question[]> {
  await getPrep(userId, prepId) // throws NotFoundError/ForbiddenError if not readable
  return prisma.question.findMany({ where: { prepId }, orderBy: { createdAt: 'asc' } })
}

export interface CreateQuestionInput {
  type: string
  content: Prisma.InputJsonValue
}

export async function insertMany(userId: string, prepId: string, questions: CreateQuestionInput[]): Promise<Question[]> {
  const prep = await getPrep(userId, prepId)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)

  await prisma.question.createMany({
    data: questions.map(q => ({ prepId, type: q.type, content: q.content })),
  })
  return prisma.question.findMany({ where: { prepId }, orderBy: { createdAt: 'asc' } })
}
