"use server"

import { requireUserId } from "@/lib/currentUser"
import { ForbiddenError } from "@/repositories/errors"
import * as prepRepository from "@/repositories/prepRepository"
import * as prepStateRepository from "@/repositories/prepStateRepository"
import type { GeneratedPrepState, PrepProgress } from "@/repositories/prepStateRepository"

async function assertOwnsPrep(prepId: string): Promise<void> {
  const userId = await requireUserId()
  const prep = await prepRepository.getPrep(userId, prepId)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)
}

export async function loadMyPrepState(prepId: string): Promise<GeneratedPrepState> {
  await assertOwnsPrep(prepId)
  return prepStateRepository.loadPrepState(prepId)
}

export async function getMyPrepProgress(prepId: string): Promise<PrepProgress | null> {
  await assertOwnsPrep(prepId)
  return prepStateRepository.getPrepProgress(prepId)
}
