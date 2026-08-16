import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', async () => {
  const { createPglitePrisma } = await import('../../test/pglitePrisma')
  return { prisma: await createPglitePrisma() }
})

import { prisma } from '../../lib/prisma'
import { ForbiddenError, NotFoundError } from '../errors'
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

describe('createPrep / getPrep', () => {
  it('lets the owner read their own private prep', async () => {
    const created = await prepRepository.createPrep(OWNER, { title: 'My Prep', pages: [], language: 'en' })
    const found = await prepRepository.getPrep(OWNER, created.id)
    expect(found.id).toBe(created.id)
  })

  it('rejects a non-owner reading a private prep', async () => {
    const created = await prepRepository.createPrep(OWNER, { title: 'My Prep', pages: [], language: 'en' })
    await expect(prepRepository.getPrep(OTHER, created.id)).rejects.toThrow(ForbiddenError)
  })

  it('rejects an anonymous reader on a private prep', async () => {
    const created = await prepRepository.createPrep(OWNER, { title: 'My Prep', pages: [], language: 'en' })
    await expect(prepRepository.getPrep(null, created.id)).rejects.toThrow(ForbiddenError)
  })

  it('lets anyone read a public prep', async () => {
    const created = await prepRepository.createPrep(OWNER, { title: 'Shared Prep', pages: [], language: 'en' })
    await prepRepository.updatePrep(OWNER, created.id, { visibility: 'public' })

    const asOther = await prepRepository.getPrep(OTHER, created.id)
    const asAnon = await prepRepository.getPrep(null, created.id)
    expect(asOther.id).toBe(created.id)
    expect(asAnon.id).toBe(created.id)
  })

  it('throws NotFoundError for a missing prep', async () => {
    await expect(prepRepository.getPrep(OWNER, 'does-not-exist')).rejects.toThrow(NotFoundError)
  })
})

describe('updatePrep / deletePrep', () => {
  it('rejects updates from a non-owner', async () => {
    const created = await prepRepository.createPrep(OWNER, { title: 'My Prep', pages: [], language: 'en' })
    await expect(prepRepository.updatePrep(OTHER, created.id, { title: 'Hijacked' })).rejects.toThrow(ForbiddenError)
  })

  it('rejects deletes from a non-owner and allows the owner to delete', async () => {
    const created = await prepRepository.createPrep(OWNER, { title: 'My Prep', pages: [], language: 'en' })
    await expect(prepRepository.deletePrep(OTHER, created.id)).rejects.toThrow(ForbiddenError)
    await prepRepository.deletePrep(OWNER, created.id)
    await expect(prepRepository.getPrep(OWNER, created.id)).rejects.toThrow(NotFoundError)
  })
})

describe('listOwnedPreps', () => {
  it('only returns the given user\'s preps', async () => {
    await prepRepository.createPrep(OWNER, { title: 'Owner Prep', pages: [], language: 'en' })
    await prepRepository.createPrep(OTHER, { title: 'Other Prep', pages: [], language: 'en' })

    const owned = await prepRepository.listOwnedPreps(OWNER)
    expect(owned).toHaveLength(1)
    expect(owned[0].title).toBe('Owner Prep')
  })
})

describe('listPublicCatalog', () => {
  it('includes only public preps, with question counts', async () => {
    const priv = await prepRepository.createPrep(OWNER, { title: 'Private', pages: [], language: 'en' })
    const pub = await prepRepository.createPrep(OWNER, { title: 'Public', pages: [], language: 'en' })
    await prepRepository.updatePrep(OWNER, pub.id, { visibility: 'public' })
    await prisma.question.createMany({
      data: [
        { prepId: pub.id, type: 'flashcard', content: {} },
        { prepId: pub.id, type: 'flashcard', content: {} },
      ],
    })

    const catalog = await prepRepository.listPublicCatalog()
    expect(catalog.map(e => e.id)).toContain(pub.id)
    expect(catalog.map(e => e.id)).not.toContain(priv.id)
    expect(catalog.find(e => e.id === pub.id)?.questionCount).toBe(2)
  })
})

describe('incrementPrepTokens', () => {
  it('accumulates the token count', async () => {
    const created = await prepRepository.createPrep(OWNER, { title: 'My Prep', pages: [], language: 'en' })
    await prepRepository.incrementPrepTokens(created.id, 100)
    await prepRepository.incrementPrepTokens(created.id, 50)
    const found = await prepRepository.getPrep(OWNER, created.id)
    expect(found.tokensUsed).toBe(150)
  })
})
