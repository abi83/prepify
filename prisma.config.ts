import "dotenv/config"
import { defineConfig } from "prisma/config"

// Direct (unpooled) URL — the pooler doesn't support migrate's session locking.
// Falls back to '' so `prisma generate`, which needs no connection, still works
// when DATABASE_URL_DIRECT isn't set (e.g. the Docker build stage).
//
// shadowDatabaseUrl is only used by `migrate dev`/`migrate diff` to replay migration
// history for a diff — it should point at a disposable Postgres (never Neon). Unset
// locally; CI's check-migrations job sets it to its throwaway service container.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL_DIRECT ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
