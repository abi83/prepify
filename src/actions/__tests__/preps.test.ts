import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/actions/uploads", () => ({ deletePrepObjects: vi.fn() }))
vi.mock("@/lib/currentUser", () => ({ requireUserId: vi.fn().mockResolvedValue("user-1") }))
vi.mock("@/repositories/prepRepository", () => ({ createPrep: vi.fn(), updatePrep: vi.fn() }))

import { createPrep, updatePrep } from "@/actions/preps"
import * as prepRepository from "@/repositories/prepRepository"

beforeEach(() => vi.clearAllMocks())

describe("createPrep", () => {
  it("passes an allowed payload through", async () => {
    await createPrep({ title: "T", language: "en" })

    expect(prepRepository.createPrep).toHaveBeenCalledWith("user-1", { title: "T", language: "en" })
  })

  it("rejects an injected userId", async () => {
    await expect(createPrep({ title: "T", language: "en", userId: "other" } as never)).rejects.toThrow()
    expect(prepRepository.createPrep).not.toHaveBeenCalled()
  })
})

describe("updatePrep", () => {
  it("passes allowed fields through", async () => {
    await updatePrep("p1", { visibility: "public", grade: 7 })

    expect(prepRepository.updatePrep).toHaveBeenCalledWith("user-1", "p1", { visibility: "public", grade: 7 })
  })

  it.each([
    [ "userId", { userId: "other" } ],
    [ "id", { id: "other" } ],
    [ "an invalid visibility", { visibility: "everyone" } ],
  ])("rejects %s", async (_label, data) => {
    await expect(updatePrep("p1", data as never)).rejects.toThrow()
    expect(prepRepository.updatePrep).not.toHaveBeenCalled()
  })
})
