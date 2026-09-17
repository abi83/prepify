import type { MetadataRoute } from 'next'
import { listPublicCatalog } from '@/repositories/prepRepository'

export const dynamic = 'force-dynamic'

const appUrl = process.env.AUTH_URL ?? 'http://localhost:3000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const preps = await listPublicCatalog()

  return [
    { url: `${appUrl}/catalog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    ...preps.map(prep => ({
      url: `${appUrl}/study/${prep.id}`,
      lastModified: prep.createdAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]
}
