import { NextResponse } from "next/server"

import { APP_VERSION } from "@/lib/version"

// BUILD_SUFFIX is a runtime env var; a prerendered response would freeze it at build time
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ status: "ok", version: APP_VERSION })
}
