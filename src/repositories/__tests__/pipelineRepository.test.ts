import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', async () => {
  const { createPglitePrisma } = await import('../../test/pglitePrisma')
  return { prisma: await createPglitePrisma() }
})

import { prisma } from '../../lib/prisma'
import type { Concept, QuestionTask } from '../../types/pipeline'
import { ForbiddenError } from '../errors'
import * as pipelineRepository from '../pipelineRepository'
import * as prepRepository from '../prepRepository'

const OWNER = 'user-owner'
const OTHER = 'user-other'

const concept: Concept = { name: 'Concept', description: 'x'.repeat(40), importance: 0.5, misconceptions: [] }
const task: QuestionTask = { concepts: [concept], type: 'flashcard' }

beforeEach(async () => {
  await prisma.attempt.deleteMany()
  await prisma.pipelineQuestion.deleteMany()
  await prisma.pipelineRun.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.question.deleteMany()
  await prisma.prep.deleteMany()
})

describe('loadOrCreateRun', () => {
  it('creates a run for the owner and reuses it on a second call', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    const first = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    const second = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    expect(second.runId).toBe(first.runId)
  })

  it('rejects a non-owner, even when the prep is shared', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    await prepRepository.updatePrep(OWNER, prep.id, { visibility: 'public' })
    await expect(pipelineRepository.loadOrCreateRun(OTHER, prep.id)).rejects.toThrow(ForbiddenError)
  })
})

describe('run progression', () => {
  it('saves concepts, tasks, and question slots, then summarizes progress', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)

    await pipelineRepository.saveConcepts(OWNER, runId, [concept])
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [task, task])

    let summary = await pipelineRepository.getExistingRunSummary(OWNER, prep.id)
    expect(summary).toEqual({ hasConcepts: true, totalTasks: 2, completedSlots: 0 })

    await pipelineRepository.saveQuestionSlot(OWNER, runId, 0, {
      type: 'flashcard',
      content: { front: 'Q', back: 'A', back_explanation: '', asset_hint: { needed: false, type: null, description: null } },
    })

    summary = await pipelineRepository.getExistingRunSummary(OWNER, prep.id)
    expect(summary?.completedSlots).toBe(1)

    const reloaded = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    expect(reloaded.concepts).toEqual([concept])
    expect(reloaded.questionSlots.get(0)).not.toBeNull()
    expect(reloaded.questionSlots.get(1)).toBeNull()
  })
})

describe('deleteRun', () => {
  it('removes the run and cascades its question slots', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [task])

    await pipelineRepository.deleteRun(OWNER, prep.id)

    expect(await prisma.pipelineRun.findUnique({ where: { id: runId } })).toBeNull()
    expect(await prisma.pipelineQuestion.findMany({ where: { runId } })).toHaveLength(0)
    expect(await pipelineRepository.getExistingRunSummary(OWNER, prep.id)).toBeNull()
  })
})
