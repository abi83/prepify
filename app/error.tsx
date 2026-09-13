'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ErrorState'
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

  return <ErrorState message="Something went wrong." action={<Button onClick={reset}>Try again</Button>} />
}
