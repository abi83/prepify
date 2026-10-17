"use server"

import { currentUserId, requireUserId } from "@/lib/currentUser"
import { ForbiddenError } from "@/repositories/errors"
import * as prepRepository from "@/repositories/prepRepository"
import * as prepStateRepository from "@/repositories/prepStateRepository"
import type { GeneratedPrepState, JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"

async function assertOwnsPrep(prepId: string): Promise<void> {
  const userId = await requireUserId()
  const prep = await prepRepository.getPrep(userId, prepId)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)
}

export async function loadMyPrepState(prepId: string): Promise<GeneratedPrepState> {
  await assertOwnsPrep(prepId)
  return prepStateRepository.loadPrepState(prepId)
}

/** Readable by the owner and, for a shared prep, anonymous visitors. */
export async function listConcepts(prepId: string): Promise<StatedConcept[]> {
  return prepStateRepository.listConcepts(await currentUserId(), prepId)
}

/** Readable by the owner and, for a shared prep, anonymous visitors. */
export async function listJobGenerations(prepId: string): Promise<Record<string, JobGeneration>> {
  return prepStateRepository.listJobGenerations(await currentUserId(), prepId)
}

export async function loadMyRejectedPageGenerations(prepId: string): Promise<Record<string, JobGeneration>> {
  await assertOwnsPrep(prepId)
  return prepStateRepository.loadRejectedPageGenerations(prepId)
}

export async function getMyPrepProgress(prepId: string): Promise<PrepProgress | null> {
  await assertOwnsPrep(prepId)
  return prepStateRepository.getPrepProgress(prepId)
}
