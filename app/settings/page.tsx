'use client'

import { Suspense } from 'react'
import AuthGuard from '../../src/lib/AuthGuard'
import SettingsPage from '../../src/screens/SettingsPage'

export default function Page() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <SettingsPage />
      </Suspense>
    </AuthGuard>
  )
}
