import { mkdtemp, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { afterEach, describe, expect, it } from "vitest"

import { createLogger } from "@/lib/logger/core"
import { createFileTransport } from "@/lib/logger/fileTransport"

let dir: string

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("createFileTransport", () => {
  it("appends one JSON line per log call, creating missing directories", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "file-logger-"))
    const file = path.join(dir, "nested", "app.log")
    const logger = createLogger({ transport: createFileTransport(file), minLevel: "debug" })

    logger.info("first", { a: 1 })
    logger.warn("second")

    const lines = (await readFile(file, "utf-8")).trim().split("\n").map(line => JSON.parse(line))
    expect(lines).toMatchObject([ { level: "info", message: "first", a: 1 }, { level: "warn", message: "second" } ])
  })
})
