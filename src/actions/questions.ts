"use server"

import type { Question } from "@prisma/client"

import { requireUserId } from "@/lib/currentUser"
import * as questionRepository from "@/repositories/questionRepository"

export async function listMyQuestions(prepId: string): Promise<Question[]> {
  return questionRepository.listByPrep(await requireUserId(), prepId)
}

export async function listSharedQuestions(prepId: string): Promise<Question[]> {
  return questionRepository.listByPrep(null, prepId)
}
