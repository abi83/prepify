import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', async () => {
  const { createPglitePrisma } = await import('../../test/pglitePrisma')
  return { prisma: await createPglitePrisma() }
})

import { prisma } from '../../lib/prisma'
import * as assetRepository from '../assetRepository'
import { ForbiddenError } from '../errors'
import * as prepRepository from '../prepRepository'
import * as questionRepository from '../questionRepository'

const OWNER = 'user-owner'
const OTHER = 'user-other'

beforeEach(async () => {
  await prisma.attempt.deleteMany()
  await prisma.pipelineQuestion.deleteMany()
  await prisma.pipelineRun.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.question.deleteMany()
  await prisma.prep.deleteMany()
})

async function makeQuestion(userId: string, prepId: string) {
  const [question] = await questionRepository.insertMany(userId, prepId, [{ type: 'flashcard', content: {} }])
  return question
}

describe('insert', () => {
  it('lets the owner insert an asset via the question/prep chain', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    const question = await makeQuestion(OWNER, prep.id)
    const asset = await assetRepository.insert(OWNER, question.id, 'formula', '<svg></svg>')
    expect(asset.questionId).toBe(question.id)
  })

  it('rejects a non-owner', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    const question = await makeQuestion(OWNER, prep.id)
    await expect(assetRepository.insert(OTHER, question.id, 'formula', '<svg></svg>')).rejects.toThrow(ForbiddenError)
  })
})

describe('listByQuestionIds', () => {
  it('is visible to the owner and to anyone once the prep is shared, but not while private', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    const question = await makeQuestion(OWNER, prep.id)
    await assetRepository.insert(OWNER, question.id, 'formula', '<svg></svg>')

    expect(await assetRepository.listByQuestionIds(OWNER, [question.id])).toHaveLength(1)
    expect(await assetRepository.listByQuestionIds(null, [question.id])).toHaveLength(0)

    await prepRepository.updatePrep(OWNER, prep.id, { visibility: 'link' })
    expect(await assetRepository.listByQuestionIds(null, [question.id])).toHaveLength(1)
  })
})
