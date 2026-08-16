'use server'

import type { Attempt } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { STUB_USER_ID } from '../lib/currentUser'
import * as attemptRepository from '../repositories/attemptRepository'

export async function listMyAttempts(prepId: string): Promise<Attempt[]> {
  return attemptRepository.listForPrep(STUB_USER_ID, prepId)
}

export async function insertAttempt(prepId: string, mode: string, score: number, total: number): Promise<Attempt> {
  const attempt = await attemptRepository.insert(STUB_USER_ID, prepId, mode, score, total)
  revalidatePath(`/preps/${prepId}`)
  return attempt
}
