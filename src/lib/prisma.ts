import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

import { config } from "./env"

// Next.js dev hot-reload re-evaluates this module on every edit; cache the
// client on `globalThis` so we don't open a fresh pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function getClient(): PrismaClient {
    if (!globalForPrisma.prisma) {
        const adapter = new PrismaPg({ connectionString: config.DATABASE_URL_POOLING })
        globalForPrisma.prisma = new PrismaClient({ adapter })
    }
    return globalForPrisma.prisma
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
    get(_, prop) {
        const client = getClient()
        const value = (client as unknown as Record<string | symbol, unknown>)[prop as string | symbol]
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value
    },
})
