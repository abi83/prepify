import type { Asset } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ForbiddenError, NotFoundError } from './errors'
import { isReadableBy } from './prepRepository'

export async function listByQuestionIds(userId: string | null, questionIds: string[]): Promise<Asset[]> {
  if (questionIds.length === 0) return []
  const rows = await prisma.asset.findMany({
    where: { questionId: { in: questionIds } },
    include: { question: { include: { prep: true } } },
  })
  return rows
    .filter(({ question }) => isReadableBy(question.prep, userId))
    .map(({ question: _question, ...asset }) => asset)
}

export async function insert(userId: string, questionId: string, type: string, blob: string): Promise<Asset> {
  const question = await prisma.question.findUnique({ where: { id: questionId }, include: { prep: true } })
  if (!question) throw new NotFoundError(`Question ${questionId} not found`)
  if (question.prep.userId !== userId) throw new ForbiddenError(`Question ${questionId}'s prep is not owned by ${userId}`)
  return prisma.asset.create({ data: { questionId, type, blob } })
}
