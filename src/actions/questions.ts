'use server'

import type { Question } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { STUB_USER_ID } from '../lib/currentUser'
import * as questionRepository from '../repositories/questionRepository'
import type { CreateQuestionInput } from '../repositories/questionRepository'

export async function listMyQuestions(prepId: string): Promise<Question[]> {
  return questionRepository.listByPrep(STUB_USER_ID, prepId)
}

export async function listSharedQuestions(prepId: string): Promise<Question[]> {
  return questionRepository.listByPrep(null, prepId)
}

export async function insertQuestions(prepId: string, questions: CreateQuestionInput[]): Promise<Question[]> {
  const saved = await questionRepository.insertMany(STUB_USER_ID, prepId, questions)
  revalidatePath(`/preps/${prepId}`)
  return saved
}
