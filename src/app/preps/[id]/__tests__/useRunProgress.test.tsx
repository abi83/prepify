import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { contentSignature, REFRESH_INTERVAL_MS, shouldRefreshContent, useRunProgress } from "@/app/preps/[id]/useRunProgress"
import type { PrepProgress } from "@/repositories/prepStateRepository"

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock("@/actions/prepState", () => ({ getMyPrepProgress: vi.fn() }))

const progress = (over: Partial<PrepProgress> = {}): PrepProgress => ({
  runState: "running", totalPages: 3, ocrPages: 0, rejectedPages: 0, hasConcepts: false,
  totalQuestions: 0, completedQuestions: 0, failedQuestions: 0, terminalQuestions: 0,
  totalFlashcards: 0, completedFlashcards: 0, failedFlashcards: 0, terminalFlashcards: 0, ...over,
})

describe("shouldRefreshContent", () => {
  it("is false when content counts are unchanged, even if runState differs", () => {
    const last = contentSignature(progress({ ocrPages: 1 }))
    expect(shouldRefreshContent(last, progress({ ocrPages: 1, runState: "idle" }), 0, 1e9)).toBe(false)
  })

  it("is true when a count changed and the interval elapsed", () => {
    const last = contentSignature(progress())
    expect(shouldRefreshContent(last, progress({ ocrPages: 1 }), 0, REFRESH_INTERVAL_MS)).toBe(true)
  })

  it("is false when a count changed within the interval", () => {
    const last = contentSignature(progress())
    expect(shouldRefreshContent(last, progress({ completedQuestions: 1 }), 1000, 1000 + REFRESH_INTERVAL_MS - 1)).toBe(false)
  })
})

describe("useRunProgress", () => {
  class FakeSource {
    static last: FakeSource
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    listeners: Record<string, () => void> = {}
    close = vi.fn()
    constructor() { FakeSource.last = this }
    addEventListener(name: string, cb: () => void) { this.listeners[name] = cb }
    emit(p: PrepProgress) { this.onmessage?.({ data: JSON.stringify(p) }) }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    vi.stubGlobal("EventSource", FakeSource)
    mockRefresh.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("refreshes on changed counts, throttled, and not on unchanged ticks", () => {
    const initial = progress()
    renderHook(() => useRunProgress("p1", initial, vi.fn()))
    const source = FakeSource.last

    act(() => source.emit(progress()))
    expect(mockRefresh).not.toHaveBeenCalled()

    act(() => source.emit(progress({ ocrPages: 1 })))
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    act(() => source.emit(progress({ ocrPages: 1 })))
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    act(() => source.emit(progress({ ocrPages: 2 })))
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
    act(() => source.emit(progress({ ocrPages: 2 })))
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it("refreshes once more when the run ends", () => {
    const initial = progress()
    renderHook(() => useRunProgress("p1", initial, vi.fn()))
    act(() => FakeSource.last.listeners.done())
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("opens no stream for a finished prep", () => {
    const constructed = vi.fn()
    vi.stubGlobal("EventSource", class { constructor() { constructed() } addEventListener() {} close() {} })
    const idle = progress({ runState: "idle" })
    renderHook(() => useRunProgress("p1", idle, vi.fn()))
    expect(constructed).not.toHaveBeenCalled()
  })

  it("starts watching when a refresh delivers a running state, and stops when the run ends", () => {
    const constructed = vi.fn()
    class CountingSource extends FakeSource { constructor() { super(); constructed() } }
    vi.stubGlobal("EventSource", CountingSource)

    const { rerender, result } = renderHook(({ server }) => useRunProgress("p1", server, vi.fn()), {
      initialProps: { server: progress({ runState: "idle", totalPages: 2 }) as PrepProgress | null },
    })
    expect(constructed).not.toHaveBeenCalled()

    rerender({ server: progress({ runState: "running", totalPages: 2 }) })
    expect(constructed).toHaveBeenCalledTimes(1)
    expect(result.current.progress?.runState).toBe("running")

    act(() => FakeSource.last.listeners.done())
    expect(FakeSource.last.close).toHaveBeenCalled()
    expect(constructed).toHaveBeenCalledTimes(1)
  })
})
