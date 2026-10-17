"use server"

import type { Prep } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { deletePrepObjects } from "@/actions/uploads"
import { requireUserId } from "@/lib/currentUser"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import type { CatalogEntry, CreatePrepInput, UpdatePrepInput } from "@/repositories/prepRepository"
import { createPrepInputSchema, updatePrepInputSchema } from "@/types/prep"

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
  await deletePrepObjects(images.map(i => i.gcsKey))
  await prepRepository.deletePrep(userId, id)
  revalidatePath("/preps")
}

export async function getPrepTokens(id: string): Promise<number> {
  return prepRepository.getPrepTokens(await requireUserId(), id)
}

export async function getTotalTokens(): Promise<number> {
  return prepRepository.getOwnedTokens(await requireUserId())
}

export async function getPrepCost(id: string): Promise<number> {
  return prepRepository.getPrepCost(await requireUserId(), id)
}

export async function getTotalCost(): Promise<number> {
  return prepRepository.getOwnedCost(await requireUserId())
}
