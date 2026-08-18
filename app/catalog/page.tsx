import CatalogPage from '@/screens/CatalogPage'
import { listCatalog } from '@/actions/preps'

// Data changes per-user-action and there's no DB access at build time — always render per-request.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const entries = await listCatalog()
  return <CatalogPage entries={entries} />
}
