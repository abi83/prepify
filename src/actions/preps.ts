'use server'

import type { Prep } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '../lib/currentUser'
import * as prepRepository from '../repositories/prepRepository'
import type { CatalogEntry, CreatePrepInput, UpdatePrepInput } from '../repositories/prepRepository'

export async function listMyPreps(): Promise<Prep[]> {
  return prepRepository.listOwnedPreps(await requireUserId())
}

export async function listCatalog(): Promise<CatalogEntry[]> {
  return prepRepository.listPublicCatalog()
}

export async function getMyPrep(id: string): Promise<Prep> {
  return prepRepository.getPrep(await requireUserId(), id)
}

export async function getSharedPrep(id: string): Promise<Prep> {
  return prepRepository.getPrep(null, id)
}

export async function createPrep(data: CreatePrepInput): Promise<Prep> {
  const prep = await prepRepository.createPrep(await requireUserId(), data)
  revalidatePath('/preps')
  return prep
}

export async function updatePrep(id: string, data: UpdatePrepInput): Promise<Prep> {
  const prep = await prepRepository.updatePrep(await requireUserId(), id, data)
  revalidatePath(`/preps/${id}`)
  revalidatePath('/catalog')
  return prep
}

export async function deletePrep(id: string): Promise<void> {
  await prepRepository.deletePrep(await requireUserId(), id)
  revalidatePath('/preps')
}

/** Fire-and-forget from the client pipeline as generation progresses — no revalidation needed. */
export async function incrementPrepTokens(id: string, delta: number): Promise<void> {
  await prepRepository.incrementPrepTokens(id, delta)
}

export async function getTotalTokens(): Promise<number> {
  const preps = await prepRepository.listOwnedPreps(await requireUserId())
  return preps.reduce((sum, p) => sum + p.tokensUsed, 0)
}
