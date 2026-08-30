'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Prep } from '@prisma/client'
import { signOut as authSignOut } from 'next-auth/react'
import { SettingsIcon, XIcon } from 'lucide-react'
import { deletePrep } from '../actions/preps'
import UploadModal from '../components/UploadModal'
import { Button } from '../components/ui/button'

interface Props {
  preps: Prep[]
}

export default function MyPreps({ preps: initialPreps }: Props) {
  const [preps, setPreps] = useState<Prep[]>(initialPreps)
  const [showUpload, setShowUpload] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  useEffect(() => setPreps(initialPreps), [initialPreps])

  async function signOut() {
    await authSignOut({ redirectTo: '/' })
  }

  function handleDone(prepId: string) {
    setShowUpload(false)
    router.push(`/preps/${prepId}`)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    await deletePrep(id)
    setPreps(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
    setDeleting(false)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-base font-bold tracking-tight">Prepify</span>
        <div className="flex items-center gap-2">
          <Link
            href="/catalog"
            className="rounded-sm border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Catalog
          </Link>
          <Button variant="outline" size="icon" onClick={() => router.push('/settings')} title="Settings" aria-label="Settings">
            <SettingsIcon />
          </Button>
          <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">My Preps</h1>
          <Button onClick={() => setShowUpload(true)}>+ New Prep</Button>
        </div>

        {preps.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-20 text-center text-2xl">
            <span>📚</span>
            <p className="text-base font-medium">No preps yet.</p>
            <p className="mb-2 max-w-[300px] text-sm font-normal text-muted-foreground">
              Upload a photo of a textbook page to get started.
            </p>
            <Button onClick={() => setShowUpload(true)}>Upload your first page</Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {preps.map(prep => (
              <li key={prep.id} className="flex items-stretch gap-2">
                <button
                  className="flex flex-1 items-center justify-between gap-4 rounded-lg border border-border bg-background px-5 py-4.5 text-left transition-colors hover:border-primary hover:bg-muted"
                  onClick={() => router.push(`/preps/${prep.id}`)}
                >
                  <span className="text-sm font-medium">{prep.title}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(prep.createdAt)}</span>
                </button>
                {confirmDeleteId === prep.id ? (
                  <div className="flex shrink-0 items-center gap-1.5 px-1">
                    <span className="text-sm whitespace-nowrap text-muted-foreground">Delete?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(prep.id)}
                      disabled={deleting}
                    >
                      {deleting ? '…' : 'Yes'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(prep.id) }}
                    title="Delete prep"
                    aria-label="Delete prep"
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onDone={handleDone} />
      )}
    </div>
  )
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
