const STORAGE_KEY = "prepify_execution_mode"

export const EXECUTION_MODES = [ "client", "server" ] as const
export type ExecutionMode = typeof EXECUTION_MODES[number]

export const DEFAULT_EXECUTION_MODE: ExecutionMode = "client"

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return EXECUTION_MODES.some(mode => mode === value)
}

export const EXECUTION_MODE_INFO: Record<ExecutionMode, { label: string; facts: { name: string; value: string }[] }> = {
  client: {
    label: "Client",
    facts: [
      { name: "Key exposure", value: "Never leaves the browser" },
      { name: "Close the tab", value: "Run stops" },
      { name: "Resilience", value: "Lost on tab close or sleep" },
      { name: "Cost", value: "None" },
    ],
  },
  server: {
    label: "Server-assisted",
    facts: [
      { name: "Key exposure", value: "Sent once, held in server memory only" },
      { name: "Close the tab", value: "Run continues" },
      { name: "Resilience", value: "Heartbeat + resume after interruption" },
      { name: "Cost", value: "Cloud Run instance time" },
    ],
  },
}

export function getExecutionMode(): ExecutionMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isExecutionMode(raw) ? raw : DEFAULT_EXECUTION_MODE
  } catch {
    return DEFAULT_EXECUTION_MODE
  }
}

export function setExecutionMode(mode: ExecutionMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
}
