import type { Question } from "@prisma/client"

import { prisma } from "@/lib/prisma"

import { getPrep } from "./prepRepository"

export async function listByPrep(userId: string | null, prepId: string): Promise<Question[]> {
  await getPrep(userId, prepId) // throws NotFoundError/ForbiddenError if not readable
  return prisma.question.findMany({ where: { prepId }, orderBy: { createdAt: "asc" } })
}
