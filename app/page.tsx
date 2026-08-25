import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Home from '@/screens/Home'

export default async function Page() {
  const session = await auth()
  if (session) redirect('/preps')
  return <Home />
}
