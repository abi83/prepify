'use server'

import { STUB_USER_ID } from '../lib/currentUser'
import * as pipelineRepository from '../repositories/pipelineRepository'
import type { PartialRunSummary, PipelineRunState } from '../repositories/pipelineRepository'
import type { Concept, QuestionTask } from '../types/pipeline'
import type { GeneratedQuestion } from '../types/questions'

export async function loadOrCreateRun(prepId: string): Promise<PipelineRunState> {
  return pipelineRepository.loadOrCreateRun(STUB_USER_ID, prepId)
}

export async function saveConcepts(runId: string, concepts: Concept[]): Promise<void> {
  await pipelineRepository.saveConcepts(STUB_USER_ID, runId, concepts)
}

export async function saveQuestionTasksAndInitSlots(runId: string, tasks: QuestionTask[]): Promise<void> {
  await pipelineRepository.saveQuestionTasksAndInitSlots(STUB_USER_ID, runId, tasks)
}

export async function saveQuestionSlot(runId: string, taskIndex: number, question: GeneratedQuestion): Promise<void> {
  await pipelineRepository.saveQuestionSlot(STUB_USER_ID, runId, taskIndex, question)
}

export async function deleteRun(prepId: string): Promise<void> {
  await pipelineRepository.deleteRun(STUB_USER_ID, prepId)
}

export async function getExistingRunSummary(prepId: string): Promise<PartialRunSummary | null> {
  return pipelineRepository.getExistingRunSummary(STUB_USER_ID, prepId)
}
