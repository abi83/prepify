import AuthGuard from '@/lib/AuthGuard'
import MyPreps from '@/screens/MyPreps'
import { listMyPreps } from '@/actions/preps'

// Data changes per-user-action (create/delete) and there's no DB access at build time — always render per-request.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const preps = await listMyPreps()
  return (
    <AuthGuard>
      <MyPreps preps={preps} />
    </AuthGuard>
  )
}
