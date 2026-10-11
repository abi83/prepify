import type { Logger } from "@/core/logger"

export const consoleLogger: Logger = {
  debug: console.debug.bind(console),
  info:  console.info.bind(console),
  warn:  console.warn.bind(console),
  error: console.error.bind(console),
}
