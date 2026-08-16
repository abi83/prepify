import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', async () => {
  const { createPglitePrisma } = await import('../../test/pglitePrisma')
  return { prisma: await createPglitePrisma() }
})

import { prisma } from '../../lib/prisma'
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

describe('insertMany', () => {
  it('lets the owner insert questions', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    const saved = await questionRepository.insertMany(OWNER, prep.id, [
      { type: 'flashcard', content: { front: 'a', back: 'b' } },
    ])
    expect(saved).toHaveLength(1)
    expect(saved[0].prepId).toBe(prep.id)
  })

  it('rejects a non-owner inserting questions', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    await expect(
      questionRepository.insertMany(OTHER, prep.id, [{ type: 'flashcard', content: {} }])
    ).rejects.toThrow(ForbiddenError)
  })
})

describe('listByPrep', () => {
  it('is visible to the owner', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    await questionRepository.insertMany(OWNER, prep.id, [{ type: 'flashcard', content: {} }])
    const questions = await questionRepository.listByPrep(OWNER, prep.id)
    expect(questions).toHaveLength(1)
  })

  it('rejects an anonymous reader when the parent prep is private', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    await expect(questionRepository.listByPrep(null, prep.id)).rejects.toThrow(ForbiddenError)
  })

  it('is visible to anyone when the parent prep is public', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    await prepRepository.updatePrep(OWNER, prep.id, { visibility: 'public' })
    await questionRepository.insertMany(OWNER, prep.id, [{ type: 'flashcard', content: {} }])

    const questions = await questionRepository.listByPrep(null, prep.id)
    expect(questions).toHaveLength(1)
  })
})
