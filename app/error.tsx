'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error.digest ? `[${error.digest}]` : error.message, error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <p>Something went wrong.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
