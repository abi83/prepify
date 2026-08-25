import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Direct (unpooled) URL — the pooler doesn't support migrate's session locking.
// Falls back to '' so `prisma generate`, which needs no connection, still works
// when DATABASE_URL_DIRECT isn't set (e.g. the Docker build stage).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL_DIRECT ?? '',
  },
})
