"use server"

import type { Prep } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { currentUserId, requireUserId } from "@/lib/currentUser"
import { deletePrepObjects } from "@/lib/prepPageStorage"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import type { CreatePrepInput, PrepEntry, UpdatePrepInput } from "@/repositories/prepRepository"
import { createPrepInputSchema, updatePrepInputSchema } from "@/types/prep"

export async function listMyPreps(): Promise<PrepEntry[]> {
  return prepRepository.listOwnedPreps(await requireUserId())
}

export async function listCatalog(): Promise<PrepEntry[]> {
  return prepRepository.listPublicCatalog()
}

export async function getMyPrep(id: string): Promise<Prep> {
  return prepRepository.getPrep(await requireUserId(), id)
}

export async function getSharedPrep(id: string): Promise<Prep> {
  return prepRepository.getPrep(null, id)
}

export async function createPrep(data: CreatePrepInput): Promise<Prep> {
  const prep = await prepRepository.createPrep(await requireUserId(), createPrepInputSchema.parse(data))
  revalidatePath("/preps")
  return prep
}

export async function updatePrep(id: string, data: UpdatePrepInput): Promise<Prep> {
  const prep = await prepRepository.updatePrep(await requireUserId(), id, updatePrepInputSchema.parse(data))
  revalidatePath(`/preps/${id}`)
  revalidatePath("/preps")
  revalidatePath("/catalog")
  return prep
}

export async function deletePrep(id: string): Promise<void> {
  const userId = await requireUserId()
  const images = await prepImageRepository.listImages(userId, id)
  await deletePrepObjects(id, images.map(i => i.gcsKey))
  await prepRepository.deletePrep(userId, id)
  revalidatePath("/preps")
}

export async function getPrepTokens(id: string): Promise<number> {
  return prepRepository.getPrepTokens(await currentUserId(), id)
}

export async function getTotalTokens(): Promise<number> {
  return prepRepository.getOwnedTokens(await requireUserId())
}

export async function getPrepCost(id: string): Promise<number> {
  return prepRepository.getPrepCost(await currentUserId(), id)
}

export async function getTotalCost(): Promise<number> {
  return prepRepository.getOwnedCost(await requireUserId())
}
