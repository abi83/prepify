import type { Attempt } from "@prisma/client"

import { prisma } from "@/lib/prisma"

import * as prepRepository from "./prepRepository"

/** Attempts have no public/shared read path — always scoped to the caller's own rows. */
export async function listForPrep(userId: string, prepId: string): Promise<Attempt[]> {
  return prisma.attempt.findMany({
    where: { prepId, userId },
    orderBy: { createdAt: "desc" },
  })
}

export async function insert(userId: string, prepId: string, score: number, total: number): Promise<Attempt> {
  if (!Number.isInteger(score) || !Number.isInteger(total) || score < 0 || score > total) {
    throw new Error(`Invalid attempt score ${score}/${total}`)
  }
  await prepRepository.getPrep(userId, prepId)
  return prisma.attempt.create({ data: { prepId, userId, score, total } })
}
