import type { Attempt } from '@prisma/client'
import { prisma } from '../lib/prisma'

/** Attempts have no public/shared read path — always scoped to the caller's own rows. */
export async function listForPrep(userId: string, prepId: string): Promise<Attempt[]> {
  return prisma.attempt.findMany({
    where: { prepId, userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function insert(userId: string, prepId: string, mode: string, score: number, total: number): Promise<Attempt> {
  return prisma.attempt.create({ data: { prepId, userId, mode, score, total } })
}
