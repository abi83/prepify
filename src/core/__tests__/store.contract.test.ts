import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { afterEach, describe, expect, it } from "vitest"

import { createFileStore } from "@/core/fileStore"
import { createInMemoryStore } from "@/core/inMemoryStore"
import type { ExecutionConfig } from "@/core/job"
import type { Store } from "@/core/ports"

const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }
const ACTOR = "user-1"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

const factories: Record<string, () => Promise<Store>> = {
  createInMemoryStore: async () => createInMemoryStore(),
  createFileStore: async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "file-store-"))
    tempDirs.push(dir)
    return createFileStore(dir)
  },
}

describe.each(Object.entries(factories))("Store contract: %s", (_name, makeStore) => {
  it("creates a job and reads it back", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "ocr", [ "a" ], CONFIG)
    expect(job).toMatchObject({ type: "ocr", status: "created", inputIds: [ "a" ], config: CONFIG, question: null, output: null, failureReason: null })
    expect(await store.getJob(ACTOR, job.id)).toEqual(job)
  })

  it("gives distinct ids to jobs", async () => {
    const store = await makeStore()
    const [ a, b ] = await Promise.all([ store.createJob(ACTOR, "ocr", [], CONFIG), store.createJob(ACTOR, "ocr", [], CONFIG) ])
    expect(a.id).not.toBe(b.id)
  })

  it("returns null for a missing job", async () => {
    const store = await makeStore()
    expect(await store.getJob(ACTOR, "missing")).toBeNull()
  })

  it("existingIds returns only ids that exist", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "ocr", [], CONFIG)
    expect(await store.existingIds(ACTOR, [ job.id, "missing" ])).toEqual(new Set([ job.id ]))
  })

  it("commits an executed outcome from the expected status", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "ocr", [], CONFIG)
    expect(await store.commitJob(ACTOR, job.id, "created", { status: "executed", output: { text: "x" }, metas: [], wastedMetas: [] })).toBe(true)
    expect(await store.getJob(ACTOR, job.id)).toMatchObject({ status: "executed", output: { text: "x" }, failureReason: null })
  })

  it("supersedes a failed job, keeping its reason", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "question", [ "c" ], CONFIG, { questionType: "flashcard", difficulty: "easy" })
    await store.commitJob(ACTOR, job.id, "created", { status: "failed", failureReason: "boom", wastedMetas: [] })

    await store.supersedeJob(ACTOR, job.id)

    expect(await store.getJob(ACTOR, job.id)).toMatchObject({ status: "superseded", output: null, failureReason: "boom", question: { questionType: "flashcard" } })
  })

  it("refuses to supersede a job that isn't failed, or doesn't exist", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "ocr", [], CONFIG)
    await expect(store.supersedeJob(ACTOR, job.id)).rejects.toThrow()
    await expect(store.supersedeJob(ACTOR, "missing")).rejects.toThrow()
    expect((await store.getJob(ACTOR, job.id))?.status).toBe("created")
  })

  it("commits a failed outcome from the expected status", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "ocr", [], CONFIG)
    expect(await store.commitJob(ACTOR, job.id, "created", { status: "failed", failureReason: "boom", wastedMetas: [] })).toBe(true)
    expect(await store.getJob(ACTOR, job.id)).toMatchObject({ status: "failed", output: null, failureReason: "boom" })
  })

  it("rejects a commit from the wrong status", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "ocr", [], CONFIG)
    expect(await store.commitJob(ACTOR, job.id, "failed", { status: "executed", output: 1, metas: [], wastedMetas: [] })).toBe(false)
    expect(await store.getJob(ACTOR, job.id)).toMatchObject({ status: "created" })
  })

  it("rejects a commit for a missing job", async () => {
    const store = await makeStore()
    expect(await store.commitJob(ACTOR, "missing", "created", { status: "executed", output: 1, metas: [], wastedMetas: [] })).toBe(false)
  })

  it("lets exactly one of two commits from the same status win", async () => {
    const store = await makeStore()
    const job = await store.createJob(ACTOR, "ocr", [], CONFIG)
    const results = await Promise.all([
      store.commitJob(ACTOR, job.id, "created", { status: "executed", output: "first", metas: [], wastedMetas: [] }),
      store.commitJob(ACTOR, job.id, "created", { status: "executed", output: "second", metas: [], wastedMetas: [] }),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await store.getJob(ACTOR, job.id)).toMatchObject({ output: results[0] ? "first" : "second" })
  })
})
