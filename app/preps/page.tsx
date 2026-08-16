import AuthGuard from '@/lib/AuthGuard'
import MyPreps from '@/screens/MyPreps'

export default function Page() {
  return (
    <AuthGuard>
      <MyPreps />
    </AuthGuard>
  )
}
