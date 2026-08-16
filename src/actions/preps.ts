'use server'

import type { Prep } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { STUB_USER_ID } from '../lib/currentUser'
import * as prepRepository from '../repositories/prepRepository'
import type { CatalogEntry, CreatePrepInput, UpdatePrepInput } from '../repositories/prepRepository'

export async function listMyPreps(): Promise<Prep[]> {
  return prepRepository.listOwnedPreps(STUB_USER_ID)
}

export async function listCatalog(): Promise<CatalogEntry[]> {
  return prepRepository.listPublicCatalog()
}

export async function getMyPrep(id: string): Promise<Prep> {
  return prepRepository.getPrep(STUB_USER_ID, id)
}

export async function getSharedPrep(id: string): Promise<Prep> {
  return prepRepository.getPrep(null, id)
}

export async function createPrep(data: CreatePrepInput): Promise<Prep> {
  const prep = await prepRepository.createPrep(STUB_USER_ID, data)
  revalidatePath('/preps')
  return prep
}

export async function updatePrep(id: string, data: UpdatePrepInput): Promise<Prep> {
  const prep = await prepRepository.updatePrep(STUB_USER_ID, id, data)
  revalidatePath(`/preps/${id}`)
  revalidatePath('/catalog')
  return prep
}

export async function deletePrep(id: string): Promise<void> {
  await prepRepository.deletePrep(STUB_USER_ID, id)
  revalidatePath('/preps')
}
