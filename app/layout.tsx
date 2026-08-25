import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'
import '@/index.css'

export const metadata: Metadata = {
  title: 'Prepify',
  description: 'Turn any textbook page into a personal exam',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  )
}
