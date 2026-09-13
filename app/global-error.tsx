'use client'

import { useEffect } from 'react'
import '@/index.css'

// Only fires when the root layout itself throws — the nearest error.tsx can't catch that,
// since it renders inside the layout. Kept dependency-free (no shared components) since this
// is the last-resort fallback if something else in the app is broken too.
export default function GlobalError({
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
    <html lang="en" className="dark">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
          <p>Something went wrong.</p>
          <button
            onClick={reset}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
