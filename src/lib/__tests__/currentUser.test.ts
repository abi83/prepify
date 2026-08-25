import { describe, it, expect, vi } from 'vitest'
import type { Session } from 'next-auth'

vi.mock('../auth', () => ({ auth: vi.fn() }))

import { auth } from '../auth'
import { requireUserId } from '../currentUser'

const authMock = auth as unknown as ReturnType<typeof vi.fn<() => Promise<Session | null>>>

describe('requireUserId', () => {
  it('returns the session user id when signed in', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' }, expires: '' })
    await expect(requireUserId()).resolves.toBe('user-1')
  })

  it('throws when there is no session', async () => {
    authMock.mockResolvedValueOnce(null)
    await expect(requireUserId()).rejects.toThrow('Not authenticated')
  })
})
