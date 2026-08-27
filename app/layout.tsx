import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'
import ThemeToggle from '@/components/ThemeToggle'
import '@/index.css'

export const metadata: Metadata = {
  title: 'Prepify',
  description: 'Turn any textbook page into a personal exam',
}

// Runs before paint so the persisted theme applies without a flash of the wrong theme.
const themeInitScript = `
  try {
    const theme = localStorage.getItem('theme')
    if (theme === 'light') document.documentElement.classList.remove('dark')
    else document.documentElement.classList.add('dark')
  } catch {}
`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
        <ThemeToggle />
      </body>
    </html>
  )
}
