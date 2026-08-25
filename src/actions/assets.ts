'use server'

import type { Asset } from '@prisma/client'
import { requireUserId } from '../lib/currentUser'
import * as assetRepository from '../repositories/assetRepository'

export async function listMyAssets(questionIds: string[]): Promise<Asset[]> {
  return assetRepository.listByQuestionIds(await requireUserId(), questionIds)
}

export async function listSharedAssets(questionIds: string[]): Promise<Asset[]> {
  return assetRepository.listByQuestionIds(null, questionIds)
}

export async function insertAsset(questionId: string, type: string, blob: string): Promise<Asset> {
  return assetRepository.insert(await requireUserId(), questionId, type, blob)
}
