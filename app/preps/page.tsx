import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import MyPreps from '@/screens/MyPreps'
import { listMyPreps } from '@/actions/preps'

// Data changes per-user-action (create/delete) and there's no DB access at build time — always render per-request.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await auth()
  if (!session) redirect('/')

  const preps = await listMyPreps()
  return <MyPreps preps={preps} />
}
