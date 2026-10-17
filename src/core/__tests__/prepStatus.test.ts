import { describe, expect, it } from "vitest"

import { derivePrepStatus, type StatusJob } from "@/core/lib/prepStatus"

const MAX = 3
const job = (type: string, status: StatusJob["status"], attempts = 0): StatusJob => ({ type, status, attempts })

describe("derivePrepStatus", () => {
  it("is draft without jobs", () => {
    expect(derivePrepStatus([], MAX)).toBe("draft")
  })

  it.each([ "created", "running", "interrupted" ] as const)("is processing while a job is %s", status => {
    expect(derivePrepStatus([ job("ocr", "executed"), job("concepts", status) ], MAX)).toBe("processing")
  })

  it("is processing for a failed job with attempts left", () => {
    expect(derivePrepStatus([ job("ocr", "failed", MAX - 1) ], MAX)).toBe("processing")
  })

  it("is ready when every job executed", () => {
    expect(derivePrepStatus([ job("ocr", "executed"), job("question", "executed") ], MAX)).toBe("ready")
  })

  it.each([ "ocr", "prep.meta", "concepts.extract", "concepts" ])("is failed when a terminal %s job failed", type => {
    expect(derivePrepStatus([ job(type, "failed", MAX), job("question", "created") ], MAX)).toBe("failed")
  })

  it("ignores superseded jobs, even blocking ones", () => {
    expect(derivePrepStatus([ job("question", "superseded", MAX), job("question", "executed") ], MAX)).toBe("ready")
    expect(derivePrepStatus([ job("question", "superseded") ], MAX)).toBe("draft")
  })

  it("ignores a terminal non-blocking failure", () => {
    expect(derivePrepStatus([ job("ocr", "executed"), job("question", "failed", MAX) ], MAX)).toBe("ready")
  })
})
