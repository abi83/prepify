import { readFileSync } from "fs"
import path from "path"

import { NextResponse } from "next/server"

function readVersion(): string | undefined {
  try {
    return readFileSync(path.join(process.cwd(), "version.txt"), "utf-8").trim()
  } catch {
    return undefined
  }
}

export function GET() {
  return NextResponse.json({ status: "ok", version: readVersion() })
}
