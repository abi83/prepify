import { Prisma, type Prep, type PrepDiscipline, type PrepVisibility } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ForbiddenError, NotFoundError } from './errors'

export function isReadableBy(prep: Prep, userId: string | null): boolean {
  return prep.userId === userId || prep.visibility !== 'private'
}

export async function listOwnedPreps(userId: string): Promise<Prep[]> {
  return prisma.prep.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
}

export interface CatalogEntry extends Prep {
  questionCount: number
}

export async function listPublicCatalog(): Promise<CatalogEntry[]> {
  const preps = await prisma.prep.findMany({
    where: { visibility: 'public' },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { questions: true } } },
  })
  return preps.map(({ _count, ...prep }) => ({ ...prep, questionCount: _count.questions }))
}

export async function getPrep(userId: string | null, id: string): Promise<Prep> {
  const prep = await prisma.prep.findUnique({ where: { id } })
  if (!prep) throw new NotFoundError(`Prep ${id} not found`)
  if (!isReadableBy(prep, userId)) throw new ForbiddenError(`Prep ${id} is private`)
  return prep
}

export interface CreatePrepInput {
  title: string
  pages: Prisma.InputJsonValue
  language: string | null
}

export async function createPrep(userId: string, data: CreatePrepInput): Promise<Prep> {
  return prisma.prep.create({ data: { userId, ...data } })
}

export interface UpdatePrepInput {
  title?: string
  visibility?: PrepVisibility
  grade?: number | null
  discipline?: PrepDiscipline | null
}

export async function updatePrep(userId: string, id: string, data: UpdatePrepInput): Promise<Prep> {
  const prep = await prisma.prep.findUnique({ where: { id } })
  if (!prep) throw new NotFoundError(`Prep ${id} not found`)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${id} is not owned by ${userId}`)
  return prisma.prep.update({ where: { id }, data })
}

export async function deletePrep(userId: string, id: string): Promise<void> {
  const prep = await prisma.prep.findUnique({ where: { id } })
  if (!prep) throw new NotFoundError(`Prep ${id} not found`)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${id} is not owned by ${userId}`)
  await prisma.prep.delete({ where: { id } })
}

/** Called internally after LLM generation — not a user-facing mutation, so no ownership check. */
export async function incrementPrepTokens(id: string, delta: number): Promise<void> {
  if (delta <= 0) return
  await prisma.prep.update({ where: { id }, data: { tokensUsed: { increment: delta } } })
}
