import { describe, expect, it } from "vitest"

import { DISCIPLINES, prepMetaSchema } from "@/lib/agents/PrepMeta"

const DESCRIPTION = "Covers mitosis and the stages of eukaryotic cell division in detail."

describe("prepMetaSchema", () => {
  it("accepts a fully-labelled result", () => {
    expect(prepMetaSchema.safeParse({ title: "Cell Division", description: DESCRIPTION, grade: 9, discipline: "Biology" }).success).toBe(true)
  })

  it("accepts null grade and discipline for non-school content", () => {
    expect(prepMetaSchema.safeParse({ title: "Phone Bill", description: DESCRIPTION, grade: null, discipline: null }).success).toBe(true)
  })

  it("rejects grade outside 1–13", () => {
    expect(prepMetaSchema.safeParse({ title: "T", description: DESCRIPTION, grade: 0, discipline: null }).success).toBe(false)
    expect(prepMetaSchema.safeParse({ title: "T", description: DESCRIPTION, grade: 14, discipline: null }).success).toBe(false)
  })

  it("rejects a discipline not in the list and a too-short description", () => {
    expect(prepMetaSchema.safeParse({ title: "T", description: DESCRIPTION, grade: 5, discipline: "Art" }).success).toBe(false)
    expect(prepMetaSchema.safeParse({ title: "T", description: "short", grade: null, discipline: null }).success).toBe(false)
  })
})

describe("DISCIPLINES", () => {
  it("contains the agreed school subjects including specific languages", () => {
    expect(DISCIPLINES).toHaveLength(18)
    expect(DISCIPLINES).toContain("Philosophy/Ethics")
    expect(DISCIPLINES).toContain("Latin")
  })
})
