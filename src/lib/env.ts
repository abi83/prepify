import { z } from 'zod'

// Only vars the running app reads. DATABASE_URL_DIRECT is migration-only (prisma CLI reads it
// straight from .env) and deliberately excluded — requiring it here would fail boot in any
// environment that doesn't run migrations.
const envSchema = z.object({
  DATABASE_URL_POOLING: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_CLIENT_ID: z.string().min(1),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().min(1),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map(issue => issue.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration — missing or empty: ${missing}`)
  }
  return parsed.data
}

export const env = loadEnv()
