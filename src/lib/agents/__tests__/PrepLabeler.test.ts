import { describe, it, expect } from 'vitest'
import { prepLabelSchema, DISCIPLINES } from '../PrepLabeler'

describe('prepLabelSchema', () => {
  it('accepts a fully-labelled result', () => {
    const result = prepLabelSchema.safeParse({ grade: 9, discipline: 'Biology', confidence: 0.92 })
    expect(result.success).toBe(true)
  })

  it('accepts nulls for non-school content', () => {
    const result = prepLabelSchema.safeParse({ grade: null, discipline: null, confidence: 0.1 })
    expect(result.success).toBe(true)
  })

  it('rejects grade outside 1–13', () => {
    expect(prepLabelSchema.safeParse({ grade: 0,  discipline: null, confidence: 0.5 }).success).toBe(false)
    expect(prepLabelSchema.safeParse({ grade: 14, discipline: null, confidence: 0.5 }).success).toBe(false)
  })

  it('rejects confidence outside 0–1', () => {
    expect(prepLabelSchema.safeParse({ grade: null, discipline: null, confidence: -0.1 }).success).toBe(false)
    expect(prepLabelSchema.safeParse({ grade: null, discipline: null, confidence: 1.1  }).success).toBe(false)
  })

  it('rejects a discipline not in the enum', () => {
    const result = prepLabelSchema.safeParse({ grade: 5, discipline: 'Art', confidence: 0.7 })
    expect(result.success).toBe(false)
  })
})

describe('DISCIPLINES', () => {
  it('contains exactly the 12 agreed school subjects', () => {
    expect(DISCIPLINES).toHaveLength(12)
    expect(DISCIPLINES).toContain('Mathematics')
    expect(DISCIPLINES).toContain('Philosophy/Ethics')
    expect(DISCIPLINES).toContain('Computer Science')
  })
})
