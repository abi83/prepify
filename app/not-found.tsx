import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <p>Page not found.</p>
      <Button variant="link" className="h-auto p-0 text-muted-foreground" asChild>
        <Link href="/">← Home</Link>
      </Button>
    </div>
  )
}
