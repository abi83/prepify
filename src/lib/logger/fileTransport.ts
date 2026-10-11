import { appendFileSync, mkdirSync } from "fs"
import path from "path"

/** Transport for `createLogger` that appends each line to `file`. */
export function createFileTransport(file: string): (line: string) => void {
  mkdirSync(path.dirname(file), { recursive: true })
  return (line) => appendFileSync(file, line + "\n")
}
