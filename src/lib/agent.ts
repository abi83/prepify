import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { ZodSchema } from 'zod'

export interface AgentMetrics {
  latency_ms: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface AgentResult<T> {
  output: T
  metrics: AgentMetrics
}

interface RunAgentConfig<T> {
  name: string
  systemPrompt: string
  userPrompt: string
  schema: ZodSchema<T>
  apiKey: string
  model?: string
  signal?: AbortSignal
}

const MAX_ATTEMPTS = 3

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffMs(attempt: number): number {
  // Exponential backoff with jitter — adapted from python-agents retry_decorator.py
  const base = Math.min(500 * Math.pow(1.2, attempt - 1), 8000)
  const jitter = 0.85 + Math.random() * 0.3
  return Math.round(base * jitter)
}

function isNonRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    return err.status === 400 || err.status === 401 || err.status === 403
  }
  return false
}

export async function runAgent<T>(config: RunAgentConfig<T>): Promise<AgentResult<T>> {
  const { name, systemPrompt, userPrompt, schema, apiKey, model = 'gpt-5-nano', signal } = config

  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = performance.now()

    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: zodResponseFormat(schema, config.name),
          service_tier: 'flex',
        },
        { signal }
      )

      const latency_ms = Math.round(performance.now() - t0)
      const usage = response.usage

      const rawText = response.choices[0]?.message?.content ?? ''
      const parsed = JSON.parse(rawText)

      // Zod validation — model is constrained to match the schema via Structured Outputs,
      // so this is a cheap type-safety assertion rather than a real fallback path.
      const validated = schema.parse(parsed)

      const metrics: AgentMetrics = {
        latency_ms,
        prompt_tokens: usage?.prompt_tokens ?? 0,
        completion_tokens: usage?.completion_tokens ?? 0,
        total_tokens: usage?.total_tokens ?? 0,
      }

      if (import.meta.env.DEV) {
        console.log(`[agent:${name}]`, metrics)
      }

      return { output: validated, metrics }
    } catch (err) {
      lastError = err
      if (isNonRetryable(err) || (err instanceof Error && err.name === 'AbortError')) {
        throw err
      }
      if (attempt < MAX_ATTEMPTS) {
        await delay(backoffMs(attempt))
      }
    }
  }

  throw lastError
}
