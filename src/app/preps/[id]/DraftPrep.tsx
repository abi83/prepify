"use client"

import type { PrepImage } from "@prisma/client"
import { useEffect, useState } from "react"

import { deleteMyPrepImage } from "@/actions/prepImages"
import { getReadSignedUrl } from "@/actions/uploads"
import { ExecutionModeDialog } from "@/components/ExecutionModeDialog"
import { FilePicker } from "@/components/FilePicker"
import { Button } from "@/components/ui/button"
import { MAX_IMAGES, validateNewFiles } from "@/lib/prepImageUpload"
import { enqueueUploads, pruneUploaded, removeUpload, useUploads, type UploadEntry } from "@/lib/uploadQueue"

import type { usePrepMe } from "./usePrepMe"

type Thumb = { src: string | null; status: "uploading" | "done" | "error"; remove: () => Promise<void> }

function ThumbCard({ thumb, page }: { thumb: Thumb; page: number }) {
  const [ removing, setRemoving ] = useState(false)

  async function handleRemove() {
    setRemoving(true)
    try {
      await thumb.remove()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-sm border border-border bg-muted" style={{ aspectRatio: "3 / 4" }}>
      {thumb.src && (
        // eslint-disable-next-line @next/next/no-img-element -- blob preview or signed GCS URL, not optimizable by next/image
        <img src={thumb.src} alt={`Page ${page}`} className="block h-full w-full object-cover" />
      )}
      {thumb.status !== "uploading" && (
        <button
          className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/55 p-0 text-[0.65rem] text-white hover:bg-black/80 disabled:opacity-50"
          onClick={() => void handleRemove()}
          disabled={removing}
          aria-label={`Remove page ${page}`}
        >✕</button>
      )}
      <span className="absolute bottom-1 left-[5px] text-[0.65rem] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">{page}</span>
      {thumb.status === "uploading" && (
        <span role="status" aria-label={`Uploading page ${page}`} className="absolute right-1 bottom-1 block size-3 animate-spin rounded-full border border-white/50 border-t-white" />
      )}
      {thumb.status === "error" && (
        <span role="img" aria-label={`Page ${page} failed to upload`} className="absolute right-1 bottom-1 flex size-3.5 items-center justify-center rounded-full bg-error text-[0.5rem] font-bold text-white">!</span>
      )}
    </div>
  )
}

function usePersistedUrl(prepId: string, gcsKey: string): string | null {
  const [ url, setUrl ] = useState<string | null>(null)
  useEffect(() => {
    let ignore = false
    getReadSignedUrl(prepId, gcsKey).then(signed => {
      if (!ignore) setUrl(signed)
    })
    return () => { ignore = true }
  }, [ prepId, gcsKey ])
  return url
}

function PersistedThumb({ prepId, image, page }: { prepId: string; image: PrepImage; page: number }) {
  const src = usePersistedUrl(prepId, image.gcsKey)
  return <ThumbCard page={page} thumb={{ src, status: "done", remove: () => deleteMyPrepImage(image.id) }} />
}

function PendingThumb({ prepId, entry, page }: { prepId: string; entry: UploadEntry; page: number }) {
  const [ src, setSrc ] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(entry.file)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [ entry.file ])

  const { state } = entry
  async function remove() {
    if (state.status === "done") await deleteMyPrepImage(state.imageId)
    removeUpload(prepId, entry.pageIndex)
  }
  return <ThumbCard page={page} thumb={{ src, status: state.status, remove }} />
}

interface Props {
  prepId: string
  images: PrepImage[]
  prepMe: ReturnType<typeof usePrepMe>
}

/** A draft prep: its uploaded pages, persisted and in flight, and the "Prep me" trigger. */
export default function DraftPrep({ prepId, images, prepMe }: Props) {
  const uploads = useUploads(prepId)
  const [ errorMsg, setErrorMsg ] = useState("")

  useEffect(() => {
    pruneUploaded(prepId, images.map(i => i.id))
  }, [ prepId, images ])

  const persistedIds = images.map(i => i.id)

  const pending = uploads.filter(u => u.state.status !== "done" || !persistedIds.includes(u.state.imageId))
  const total = images.length + pending.length
  const isUploading = pending.some(u => u.state.status === "uploading")
  const hasFailed = pending.some(u => u.state.status === "error")
  const canPrepMe = total > 0 && !isUploading && !hasFailed
  const isWorking = prepMe.phase === "ocr" || prepMe.phase === "starting" || prepMe.phase === "saving"
  const { ocrProgress } = prepMe

  function handleFiles(files: File[]) {
    const { accepted, error } = validateNewFiles(files, total)
    setErrorMsg(error ?? "")
    if (accepted.length > 0) enqueueUploads(prepId, accepted, images.map(i => i.gcsKey))
  }

  return (
    <section className="flex flex-col gap-4">
      <ExecutionModeDialog open={prepMe.modeDialogOpen} onConfirm={prepMe.confirmMode} />

      {total === 0 && <p className="text-sm text-muted-foreground">Add photos of your textbook pages to get started.</p>}
      {total > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2.5">
          {images.map((image, i) => <PersistedThumb key={image.id} prepId={prepId} image={image} page={i + 1} />)}
          {pending.map((entry, i) => <PendingThumb key={entry.pageIndex} prepId={prepId} entry={entry} page={images.length + i + 1} />)}
        </div>
      )}

      {!isWorking && total < MAX_IMAGES && (
        <div className="flex flex-wrap items-center gap-2">
          <FilePicker variant="compact" onFiles={handleFiles} />
          <span className="ml-auto text-xs text-muted-foreground">{total} / {MAX_IMAGES} pages</span>
        </div>
      )}

      {errorMsg && <p className="text-sm text-error">{errorMsg}</p>}
      {hasFailed && <p className="text-xs text-error">Some images failed to upload. Remove and re-add them to retry.</p>}

      {prepMe.phase === "starting" && <p className="text-sm text-muted-foreground">Starting the server run…</p>}
      {(prepMe.phase === "ocr" || prepMe.phase === "saving") && (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            {prepMe.phase === "ocr"
              ? `Recognising image ${ocrProgress.done + 1} of ${ocrProgress.total}…`
              : "Saving your prep…"}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{
                width: prepMe.phase === "saving"
                  ? "100%"
                  : `${ocrProgress.total > 0 ? (ocrProgress.done / ocrProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {prepMe.phase === "error" && (
        <div className="flex flex-col items-center gap-4 py-2 text-center text-error">
          <p>{prepMe.errorMsg}</p>
          <Button variant="outline" onClick={prepMe.retry}>Try again</Button>
        </div>
      )}

      {!isWorking && prepMe.phase !== "error" && (
        <Button className="w-full" onClick={prepMe.start} disabled={!canPrepMe}>Prep me</Button>
      )}
    </section>
  )
}
