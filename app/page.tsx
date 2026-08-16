'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '../src/lib/SessionProvider'
import Home from '../src/screens/Home'

export default function Page() {
  const session = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session) router.replace('/preps')
  }, [session, router])

  if (session) return null
  return <Home />
}
