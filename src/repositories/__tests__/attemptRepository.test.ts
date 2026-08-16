import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', async () => {
  const { createPglitePrisma } = await import('../../test/pglitePrisma')
  return { prisma: await createPglitePrisma() }
})

import { prisma } from '../../lib/prisma'
import * as attemptRepository from '../attemptRepository'
import * as prepRepository from '../prepRepository'

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

describe('insert / listForPrep', () => {
  it('lets a user read their own attempts', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    await attemptRepository.insert(OWNER, prep.id, 'quiz', 4, 5)

    const attempts = await attemptRepository.listForPrep(OWNER, prep.id)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ mode: 'quiz', score: 4, total: 5 })
  })

  it('never returns another user\'s attempts, even for the prep owner', async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: 'Prep', pages: [], language: 'en' })
    await prepRepository.updatePrep(OWNER, prep.id, { visibility: 'public' })
    await attemptRepository.insert(OTHER, prep.id, 'test', 3, 5)

    const ownerAttempts = await attemptRepository.listForPrep(OWNER, prep.id)
    const otherAttempts = await attemptRepository.listForPrep(OTHER, prep.id)
    expect(ownerAttempts).toHaveLength(0)
    expect(otherAttempts).toHaveLength(1)
  })
})
