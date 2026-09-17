import type { Metadata } from 'next'
import { Inter, Sora } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import ThemeToggle from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'
import '@/index.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
})

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-sora',
})

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={cn(inter.variable, sora.variable)}>
        <SessionProvider>{children}</SessionProvider>
        <ThemeToggle />
      </body>
    </html>
  )
}
