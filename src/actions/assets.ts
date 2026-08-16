'use server'

import type { Asset } from '@prisma/client'
import { STUB_USER_ID } from '../lib/currentUser'
import * as assetRepository from '../repositories/assetRepository'

export async function listMyAssets(questionIds: string[]): Promise<Asset[]> {
  return assetRepository.listByQuestionIds(STUB_USER_ID, questionIds)
}

export async function listSharedAssets(questionIds: string[]): Promise<Asset[]> {
  return assetRepository.listByQuestionIds(null, questionIds)
}

export async function insertAsset(questionId: string, type: string, blob: string): Promise<Asset> {
  return assetRepository.insert(STUB_USER_ID, questionId, type, blob)
}
