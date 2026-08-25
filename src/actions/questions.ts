'use server'

import type { Question } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '../lib/currentUser'
import * as questionRepository from '../repositories/questionRepository'
import type { CreateQuestionInput } from '../repositories/questionRepository'

export async function listMyQuestions(prepId: string): Promise<Question[]> {
  return questionRepository.listByPrep(await requireUserId(), prepId)
}

export async function listSharedQuestions(prepId: string): Promise<Question[]> {
  return questionRepository.listByPrep(null, prepId)
}

export async function insertQuestions(prepId: string, questions: CreateQuestionInput[]): Promise<Question[]> {
  const saved = await questionRepository.insertMany(await requireUserId(), prepId, questions)
  revalidatePath(`/preps/${prepId}`)
  return saved
}
