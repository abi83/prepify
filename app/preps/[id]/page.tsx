'use client'

import AuthGuard from '../../../src/lib/AuthGuard'
import PrepPage from '../../../src/screens/PrepPage'

export default function Page() {
  return (
    <AuthGuard>
      <PrepPage />
    </AuthGuard>
  )
}
