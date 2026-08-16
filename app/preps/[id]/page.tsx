import AuthGuard from '@/lib/AuthGuard'
import PrepPage from '@/screens/PrepPage'

export default function Page() {
  return (
    <AuthGuard>
      <PrepPage />
    </AuthGuard>
  )
}
