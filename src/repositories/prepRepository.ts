import type { Language, Prep, PrepDiscipline, PrepVisibility, Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

import { ForbiddenError, NotFoundError } from "./errors"

export function isReadableBy(prep: Prep, userId: string | null): boolean {
  return prep.userId === userId || prep.visibility !== "private"
}

export interface PrepEntry extends Prep {
  questionCount: number
  flashcardCount: number
  conceptCount: number
}

async function withCounts(preps: Prep[]): Promise<PrepEntry[]> {
  const prepIds = preps.map(p => p.id)
  const questions = await prisma.question.findMany({ where: { prepId: { in: prepIds } }, select: { prepId: true, type: true } })
  // Concept has no prepId — it links to a prep through the job that produced it.
  const concepts = await prisma.concept.findMany({
    where: { producedByJob: { prepId: { in: prepIds } } },
    select: { producedByJob: { select: { prepId: true } } },
  })
  return preps.map(prep => {
    const prepQuestions = questions.filter(q => q.prepId === prep.id)
    const flashcardCount = prepQuestions.filter(q => q.type === "flashcard").length
    return {
      ...prep,
      questionCount: prepQuestions.length - flashcardCount,
      flashcardCount,
      conceptCount: concepts.filter(c => c.producedByJob.prepId === prep.id).length,
    }
  })
}

export async function listOwnedPreps(userId: string): Promise<PrepEntry[]> {
  return withCounts(await prisma.prep.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: "desc" } }))
}

export async function listPublicCatalog(): Promise<PrepEntry[]> {
  return withCounts(await prisma.prep.findMany({ where: { visibility: "public", isActive: true }, orderBy: { createdAt: "desc" } }))
}

export async function getPrep(userId: string | null, id: string): Promise<Prep> {
  const prep = await prisma.prep.findUnique({ where: { id } })
  if (!prep) throw new NotFoundError(`Prep ${id} not found`)
  if (!isReadableBy(prep, userId)) throw new ForbiddenError(`Prep ${id} is private`)
  return prep
}

export interface CreatePrepInput {
  title: string
  language: Language | null
}

export async function createPrep(userId: string, data: CreatePrepInput): Promise<Prep> {
  return prisma.prep.create({ data: { userId, ...data } })
}

export interface UpdatePrepInput {
  title?: string
  description?: string
  visibility?: PrepVisibility
  grade?: number | null
  discipline?: PrepDiscipline | null
  language?: Language | null
  isActive?: boolean
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

/** Prompt + completion tokens over every LLM call matching `where`, wasted calls included (cached tokens are a subset of prompt). */
async function sumTokens(where: Prisma.GenerationMetaWhereInput): Promise<number> {
  const { _sum } = await prisma.generationMeta.aggregate({ where, _sum: { promptTokens: true, completionTokens: true } })
  return (_sum.promptTokens ?? 0) + (_sum.completionTokens ?? 0)
}

/** Stored `costUsd` over every LLM call matching `where`, wasted calls included. */
async function sumCost(where: Prisma.GenerationMetaWhereInput): Promise<number> {
  const { _sum } = await prisma.generationMeta.aggregate({ where, _sum: { costUsd: true } })
  return _sum.costUsd ?? 0
}

export async function getPrepTokens(userId: string | null, id: string): Promise<number> {
  await getPrep(userId, id)
  return sumTokens({ job: { prepId: id } })
}

export function getOwnedTokens(userId: string): Promise<number> {
  return sumTokens({ job: { prep: { userId, isActive: true } } })
}

export async function getPrepCost(userId: string | null, id: string): Promise<number> {
  await getPrep(userId, id)
  return sumCost({ job: { prepId: id } })
}

export function getOwnedCost(userId: string): Promise<number> {
  return sumCost({ job: { prep: { userId, isActive: true } } })
}
