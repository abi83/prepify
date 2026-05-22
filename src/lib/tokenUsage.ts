const STORAGE_KEY = 'prepify_token_usage'

interface TokenUsage {
  total_tokens: number
}

function read(): TokenUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { total_tokens: 0 }
    return JSON.parse(raw) as TokenUsage
  } catch {
    return { total_tokens: 0 }
  }
}

export function addTokenUsage(tokens: number): void {
  const current = read()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ total_tokens: current.total_tokens + tokens }))
}

export function getTotalTokens(): number {
  return read().total_tokens
}

export function clearTokenUsage(): void {
  localStorage.removeItem(STORAGE_KEY)
}
