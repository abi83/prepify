'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from './SessionProvider'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!session) router.replace('/')
  }, [session, router])

  if (!session) return null
  return <>{children}</>
}
