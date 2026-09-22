"use server"

import type { AgentMeta } from "@/lib/agent"
import type { Review } from "@/lib/agents/QuestionReviewer"
import { requireUserId } from "@/lib/currentUser"
import * as pipelineRepository from "@/repositories/pipelineRepository"
import type { PartialRunSummary, PipelineRunState } from "@/repositories/pipelineRepository"
import type { Concept, QuestionTask } from "@/types/pipeline"
import type { GeneratedQuestion } from "@/types/questions"

export async function loadOrCreateRun(prepId: string): Promise<PipelineRunState> {
  return pipelineRepository.loadOrCreateRun(await requireUserId(), prepId)
}

export async function saveConcepts(runId: string, concepts: Concept[]): Promise<void> {
  await pipelineRepository.saveConcepts(await requireUserId(), runId, concepts)
}

export async function saveQuestionTasksAndInitSlots(runId: string, tasks: QuestionTask[]): Promise<void> {
  await pipelineRepository.saveQuestionTasksAndInitSlots(await requireUserId(), runId, tasks)
}

export async function saveAttemptBuild(
  runId: string,
  taskIndex: number,
  attemptNum: number,
  question: GeneratedQuestion,
  meta: AgentMeta,
): Promise<void> {
  await pipelineRepository.saveAttemptBuild(await requireUserId(), runId, taskIndex, attemptNum, question, meta)
}

export async function saveAttemptReview(
  runId: string,
  taskIndex: number,
  attemptNum: number,
  review: Review,
  passed: boolean,
  meta: AgentMeta,
): Promise<void> {
  await pipelineRepository.saveAttemptReview(await requireUserId(), runId, taskIndex, attemptNum, review, passed, meta)
}

export async function finishSlot(
  runId: string,
  taskIndex: number,
  question: GeneratedQuestion,
  meta: AgentMeta[],
): Promise<void> {
  await pipelineRepository.finishSlot(await requireUserId(), runId, taskIndex, question, meta)
}

export async function failSlot(runId: string, taskIndex: number): Promise<void> {
  await pipelineRepository.failSlot(await requireUserId(), runId, taskIndex)
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
