'use client'

// TODO(#69): session is only known client-side (Supabase auth read via
// SessionProvider's onAuthStateChange), so this redirect can't happen in a
// Server Component yet. Once auth.js gives us a server-readable session,
// replace this with a real server-side `redirect()` in a non-client page.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/SessionProvider'
import Home from '@/screens/Home'

export default function Page() {
  const session = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session) router.replace('/preps')
  }, [session, router])

  if (session) return null
  return <Home />
}
