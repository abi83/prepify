'use client'

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
