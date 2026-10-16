import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/preps/[id]/progress/route"
import { ForbiddenError, NotFoundError } from "@/repositories/errors"
import * as prepRepository from "@/repositories/prepRepository"
import * as prepStateRepository from "@/repositories/prepStateRepository"

const h = vi.hoisted(() => ({ userId: "u1" as string | null }))

vi.mock("@/lib/auth", () => ({ auth: async () => (h.userId ? { user: { id: h.userId } } : null) }))
vi.mock("@/repositories/prepRepository", () => ({ getPrep: vi.fn() }))
vi.mock("@/repositories/prepStateRepository", () => ({ getPrepProgress: vi.fn() }))

const getPrep = vi.mocked(prepRepository.getPrep)
const getPrepProgress = vi.mocked(prepStateRepository.getPrepProgress)
const progress = (runState: string) => ({ runState }) as unknown as Awaited<ReturnType<typeof getPrepProgress>>

const call = () => GET(new Request("http://x"), { params: Promise.resolve({ id: "p1" }) })
const DONE = "event: done\ndata: {}\n\n"

async function readAll(res: Response) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += decoder.decode(value)
  }
}

describe("GET /api/preps/[id]/progress", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.userId = "u1"
    getPrep.mockReset().mockResolvedValue({ userId: "u1" } as Awaited<ReturnType<typeof getPrep>>)
    getPrepProgress.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it("401s when unauthenticated", async () => {
    h.userId = null
    expect((await call()).status).toBe(401)
  })

  it("404s when the prep is missing", async () => {
    getPrep.mockRejectedValue(new NotFoundError("prep"))
    expect((await call()).status).toBe(404)
  })

  it("403s when the repository forbids access", async () => {
    getPrep.mockRejectedValue(new ForbiddenError("prep"))
    expect((await call()).status).toBe(403)
  })

  it("403s when the prep belongs to someone else", async () => {
    getPrep.mockResolvedValue({ userId: "other" } as Awaited<ReturnType<typeof getPrep>>)
    expect((await call()).status).toBe(403)
  })

  it("streams data while running, then a single done once the run finishes", async () => {
    getPrepProgress
      .mockResolvedValueOnce(progress("running"))
      .mockResolvedValueOnce(progress("idle"))

    const body = readAll(await call())
    await vi.runAllTimersAsync()

    const out = await body
    expect(out).toBe(
      `data: ${JSON.stringify({ runState: "running" })}\n\ndata: ${JSON.stringify({ runState: "idle" })}\n\n${DONE}`,
    )
  })

  it("sends done once after the grace period with no run", async () => {
    getPrepProgress.mockResolvedValue(null)

    const body = readAll(await call())
    await vi.runAllTimersAsync()

    expect(await body).toBe(DONE)
    expect(getPrepProgress).toHaveBeenCalledTimes(15)
  })

  it("errors the stream when the DB read fails", async () => {
    getPrepProgress.mockRejectedValue(new Error("db down"))

    const body = readAll(await call())
    const assertion = expect(body).rejects.toThrow("db down")
    await vi.runAllTimersAsync()
    await assertion
  })

  it("stops polling after the client cancels", async () => {
    getPrepProgress.mockResolvedValue(progress("running"))

    const res = await call()
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    const calls = getPrepProgress.mock.calls.length

    await vi.advanceTimersByTimeAsync(5_000)

    expect(getPrepProgress.mock.calls.length).toBe(calls)
  })
})
