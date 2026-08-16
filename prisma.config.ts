import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Migrations run through the CLI, not the pooled runtime connection —
// Neon's pooler doesn't support the session-level locking migrate needs.
// Read via process.env (not the `env()` config helper) so `prisma generate`
// — which needs no live connection — doesn't hard-fail when
// DIRECT_DATABASE_URL isn't set, e.g. in the Docker build stage.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? '',
  },
})
