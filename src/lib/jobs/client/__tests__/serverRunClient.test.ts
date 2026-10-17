import { afterEach, describe, expect, it, vi } from "vitest"

const { mockGetProgress } = vi.hoisted(() => ({ mockGetProgress: vi.fn() }))
vi.mock("@/actions/prepState", () => ({ getMyPrepProgress: mockGetProgress }))

import { awaitRunStart, requestServerRun } from "@/lib/jobs/client/serverRunClient"

const REQUEST = {
  apiKey: "sk-secret",
  prepId: "p1",
  model: "gpt-5-nano",
  tier: "flex",
  target: { questionCount: 10, enabledTypes: [ "flashcard" as const ], difficultyMix: { easy: 1, medium: 1, hard: 1 } },
}

const respondWith = (status: number) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  mockGetProgress.mockReset()
})

describe("requestServerRun", () => {
  it("posts the request as JSON to the generate endpoint", async () => {
    respondWith(202)
    await requestServerRun(REQUEST)

    const [ url, init ] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("/api/preps/generate")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toEqual(REQUEST)
  })

  it("maps 202 to triggered and 409 to already_running", async () => {
    respondWith(202)
    expect(await requestServerRun(REQUEST)).toBe("triggered")
    respondWith(409)
    expect(await requestServerRun(REQUEST)).toBe("already_running")
  })

  it.each([ 400, 401, 403, 404 ])("throws on %i", async status => {
    respondWith(status)
    await expect(requestServerRun(REQUEST)).rejects.toThrow()
  })

  it("throws on an unexpected status", async () => {
    respondWith(500)
    await expect(requestServerRun(REQUEST)).rejects.toThrow("500")
  })
})

describe("awaitRunStart", () => {
  it("resolves once progress exists", async () => {
    vi.useFakeTimers()
    mockGetProgress.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ runState: "running" })

    const done = awaitRunStart("p1")
    await vi.advanceTimersByTimeAsync(1_000)
    await done

    expect(mockGetProgress).toHaveBeenCalledTimes(3)
  })

  it("gives up after the poll budget when no job row appears", async () => {
    vi.useFakeTimers()
    mockGetProgress.mockResolvedValue(null)

    const done = awaitRunStart("p1")
    await vi.advanceTimersByTimeAsync(20_000)
    await done

    expect(mockGetProgress).toHaveBeenCalledTimes(20)
  })
})
