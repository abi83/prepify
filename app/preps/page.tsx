'use client'

import AuthGuard from '../../src/lib/AuthGuard'
import MyPreps from '../../src/screens/MyPreps'

export default function Page() {
  return (
    <AuthGuard>
      <MyPreps />
    </AuthGuard>
  )
}
