import { Suspense } from 'react'
import AuthGuard from '@/lib/AuthGuard'
import SettingsPage from '@/screens/SettingsPage'

export default function Page() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <SettingsPage />
      </Suspense>
    </AuthGuard>
  )
}
