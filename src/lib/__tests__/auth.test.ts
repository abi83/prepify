import { describe, it, expect } from 'vitest'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { jwtCallback, sessionCallback } from '../authCallbacks'

describe('jwtCallback', () => {
  it('carries the Google profile sub into the token', () => {
    const token = {} as JWT
    const result = jwtCallback({ token, profile: { sub: 'google-user-1' } })
    expect(result.sub).toBe('google-user-1')
  })

  it('leaves an existing token sub untouched when there is no profile (token refresh)', () => {
    const token = { sub: 'google-user-1' } as JWT
    const result = jwtCallback({ token })
    expect(result.sub).toBe('google-user-1')
  })
})

describe('sessionCallback', () => {
  it('exposes the token sub as session.user.id', () => {
    const session = { user: {}, expires: '' } as Session
    const token = { sub: 'google-user-1' } as JWT
    const result = sessionCallback({ session, token })
    expect(result.user.id).toBe('google-user-1')
  })

  it('leaves session.user.id unset when the token has no sub', () => {
    const session = { user: {}, expires: '' } as Session
    const token = {} as JWT
    const result = sessionCallback({ session, token })
    expect(result.user.id).toBeUndefined()
  })
})
