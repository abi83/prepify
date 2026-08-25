'use server'

import { requireUserId } from '../lib/currentUser'
import * as pipelineRepository from '../repositories/pipelineRepository'
import type { PartialRunSummary, PipelineRunState } from '../repositories/pipelineRepository'
import type { Concept, QuestionTask } from '../types/pipeline'
import type { GeneratedQuestion } from '../types/questions'

export async function loadOrCreateRun(prepId: string): Promise<PipelineRunState> {
  return pipelineRepository.loadOrCreateRun(await requireUserId(), prepId)
}

export async function saveConcepts(runId: string, concepts: Concept[]): Promise<void> {
  await pipelineRepository.saveConcepts(await requireUserId(), runId, concepts)
}

export async function saveQuestionTasksAndInitSlots(runId: string, tasks: QuestionTask[]): Promise<void> {
  await pipelineRepository.saveQuestionTasksAndInitSlots(await requireUserId(), runId, tasks)
}

export async function saveQuestionSlot(runId: string, taskIndex: number, question: GeneratedQuestion): Promise<void> {
  await pipelineRepository.saveQuestionSlot(await requireUserId(), runId, taskIndex, question)
}

export async function deleteRun(prepId: string): Promise<void> {
  await pipelineRepository.deleteRun(await requireUserId(), prepId)
}

export async function getExistingRunSummary(prepId: string): Promise<PartialRunSummary | null> {
  return pipelineRepository.getExistingRunSummary(await requireUserId(), prepId)
}

export async function getConcepts(prepId: string): Promise<Concept[] | null> {
  return pipelineRepository.getConcepts(await requireUserId(), prepId)
}
