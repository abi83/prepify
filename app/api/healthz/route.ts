import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import path from 'path'

const version = readFileSync(path.join(process.cwd(), 'version.txt'), 'utf-8').trim()

export function GET() {
  return NextResponse.json({ status: 'ok', version })
}
