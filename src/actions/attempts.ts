'use server'

import type { Attempt } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '../lib/currentUser'
import * as attemptRepository from '../repositories/attemptRepository'

export async function listMyAttempts(prepId: string): Promise<Attempt[]> {
  return attemptRepository.listForPrep(await requireUserId(), prepId)
}

export async function insertAttempt(prepId: string, mode: string, score: number, total: number): Promise<Attempt> {
  const attempt = await attemptRepository.insert(await requireUserId(), prepId, mode, score, total)
  revalidatePath(`/preps/${prepId}`)
  return attempt
}
