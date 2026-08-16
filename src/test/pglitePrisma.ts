import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PrismaPGlite } from 'pglite-prisma-adapter'
import { PrismaClient } from '@prisma/client'

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')

/** Spins up a fresh in-memory Postgres (via PGlite) with all committed migrations applied. */
export async function createPglitePrisma(): Promise<PrismaClient> {
  const client = new PGlite()

  const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const dir of migrationDirs) {
    const sql = readFileSync(join(MIGRATIONS_DIR, dir.name, 'migration.sql'), 'utf-8')
    await client.exec(sql)
  }

  return new PrismaClient({ adapter: new PrismaPGlite(client) })
}
