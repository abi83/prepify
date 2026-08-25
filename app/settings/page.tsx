import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SettingsPage from '@/screens/SettingsPage'

export default async function Page() {
  const session = await auth()
  if (!session) redirect('/')

  return (
    <Suspense fallback={null}>
      <SettingsPage />
    </Suspense>
  )
}
