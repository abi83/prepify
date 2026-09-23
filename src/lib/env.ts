import { z } from "zod"

// Only vars the running app reads. DATABASE_URL_DIRECT is migration-only (prisma CLI reads it
// straight from .env) and deliberately excluded — requiring it here would fail boot in any
// environment that doesn't run migrations.
const envSchema = z.object({
  DATABASE_URL_POOLING: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_CLIENT_ID: z.string().min(1),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().min(1),
  GCS_BUCKET_NAME: z.string().min(1),
})

class Config {
  private _data: z.infer<typeof envSchema> | undefined

  private get data() {
    if (!this._data) {
      const parsed = envSchema.safeParse(process.env)
      if (!parsed.success) {
        const missing = parsed.error.issues.map(issue => issue.path.join(".")).join(", ")
        throw new Error(`Invalid environment configuration — missing or empty: ${missing}`)
      }
      this._data = parsed.data
    }
    return this._data
  }

  get DATABASE_URL_POOLING() { return this.data.DATABASE_URL_POOLING }
  get AUTH_SECRET() { return this.data.AUTH_SECRET }
  get AUTH_GOOGLE_CLIENT_ID() { return this.data.AUTH_GOOGLE_CLIENT_ID }
  get AUTH_GOOGLE_CLIENT_SECRET() { return this.data.AUTH_GOOGLE_CLIENT_SECRET }
  get GCS_BUCKET_NAME() { return this.data.GCS_BUCKET_NAME }
}

export const config = new Config()
