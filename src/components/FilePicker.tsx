import { useEffect, useRef, useState } from "react"

import { listMyPreps, createPrep, deletePrep } from "@/actions/preps"
import { getUploadSignedUrl } from "@/actions/uploads"

import { Button } from "./ui/button"

const MAX_IMAGES = 10
const MAX_FILE_BYTES = 5 * 1024 * 1024

type UploadStatus = "uploading" | "done" | "error"

export type RecogniseArgs = {
  prepId: string
  files: File[]
  uploadKeys: (string | null)[]
}

type Props = {
  onRecognise: (args: RecogniseArgs) => void
}

export function FilePicker({ onRecognise }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef<Promise<string> | null>(null)
  const recognisedRef = useRef(false)
  const uploadMapRef = useRef(new Map<File, Promise<string | null>>())
  const nextPageIndexRef = useRef(0)

  const [ files, setFiles ] = useState<File[]>([])
  const [ previews, setPreviews ] = useState<string[]>([])
  const [ uploadStatuses, setUploadStatuses ] = useState(new Map<File, UploadStatus>())
  const [ errorMsg, setErrorMsg ] = useState("")

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [ files ])

  useEffect(() => {
    return () => {
      if (!recognisedRef.current && draftRef.current) {
        draftRef.current.then(id => void deletePrep(id)).catch(() => {})
      }
    }
  }, [])

  function addFiles(incoming: FileList | null) {
    if (!incoming) return

    const validFiles: File[] = []
    const oversized: string[] = []

    for (const f of Array.from(incoming)) {
      if (f.size > MAX_FILE_BYTES) {
        oversized.push(f.name)
      } else {
        validFiles.push(f)
      }
    }

    if (oversized.length) {
      setErrorMsg(`${oversized.join(", ")} ${oversized.length === 1 ? "exceeds" : "exceed"} the 5 MB limit. Please use smaller images.`)
      return
    }

    setErrorMsg("")

    const toAdd = validFiles.slice(0, MAX_IMAGES - files.length)
    if (toAdd.length === 0) return

    setFiles(prev => [ ...prev, ...toAdd ].slice(0, MAX_IMAGES))

    if (draftRef.current === null) {
      draftRef.current = listMyPreps()
        .then(existing => createPrep({ title: `Prep #${existing.length + 1}`, pages: [], language: null }))
        .then(prep => prep.id)
    }

    for (const file of toAdd) {
      const pageIndex = nextPageIndexRef.current++
      setUploadStatuses(prev => new Map(prev).set(file, "uploading"))
      const promise = draftRef.current!
        .then(prepId => getUploadSignedUrl(prepId, pageIndex, file.type))
        .then(({ signedUrl, key }) =>
          fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
            .then(r => {
              const status: UploadStatus = r.ok ? "done" : "error"
              setUploadStatuses(prev => new Map(prev).set(file, status))
              return r.ok ? key : null
            })
        )
        .catch(() => {
          setUploadStatuses(prev => new Map(prev).set(file, "error"))
          return null
        })
      uploadMapRef.current.set(file, promise)
    }
  }

  function removeFile(index: number) {
    const removed = files[index]
    uploadMapRef.current.delete(removed)
    setUploadStatuses(prev => {
      const next = new Map(prev)
      next.delete(removed)
      return next
    })
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleRecognise() {
    if (!draftRef.current) return

    let prepId: string
    try {
      prepId = await draftRef.current
    } catch {
      setErrorMsg("Failed to initialize. Please try again.")
      return
    }

    const uploadKeys = await Promise.all(
      files.map(f => uploadMapRef.current.get(f) ?? Promise.resolve(null))
    )

    recognisedRef.current = true
    onRecognise({ prepId, files, uploadKeys })
  }

  const canAddMore = files.length < MAX_IMAGES
  const hasUploadErrors = files.some(f => uploadStatuses.get(f) === "error")

  return (
    <>
      {files.length === 0 ? (
        <div
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-12 transition-colors hover:border-primary hover:bg-primary/10"
          onClick={() => fileInputRef.current?.click()}
          onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-4xl">📄</span>
          <p className="text-sm font-medium">Upload photos of textbook pages</p>
          <p className="text-xs text-muted-foreground">Tap to select · or drag & drop</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2.5">
            {files.map((file, i) => {
              const status = uploadStatuses.get(file)
              return (
                <div key={i} className="relative overflow-hidden rounded-sm border border-border bg-muted" style={{ aspectRatio: "3 / 4" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL preview, not optimizable by next/image */}
                  <img src={previews[i]} alt={`Page ${i + 1}`} className="block h-full w-full object-cover" />
                  <button
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/55 p-0 text-[0.65rem] text-white hover:bg-black/80"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove page ${i + 1}`}
                  >✕</button>
                  <span className="absolute bottom-1 left-[5px] text-[0.65rem] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">{i + 1}</span>
                  {status === "uploading" && (
                    <span className="absolute right-1 bottom-1 block size-3 animate-spin rounded-full border border-white/50 border-t-white" />
                  )}
                  {status === "error" && (
                    <span className="absolute right-1 bottom-1 flex size-3.5 items-center justify-center rounded-full bg-error text-[0.5rem] font-bold text-white">!</span>
                  )}
                </div>
              )
            })}
          </div>

          {canAddMore && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                + Add files
              </Button>
              <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
                + Take photo
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">{files.length} / {MAX_IMAGES} pages</span>
            </div>
          )}
        </>
      )}

      {errorMsg && <p className="text-sm text-error">{errorMsg}</p>}

      {hasUploadErrors && (
        <p className="text-xs text-error">
          Some images failed to upload. Remove and re-add them to retry.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {files.length === 0 && (
          <Button variant="outline" className="w-full" onClick={() => cameraInputRef.current?.click()}>
            Take photo
          </Button>
        )}
        {files.length > 0 && (
          <Button className="w-full" onClick={handleRecognise} disabled={hasUploadErrors}>
            Recognise & Create
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={e => { addFiles(e.target.files); e.target.value = "" }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={e => { addFiles(e.target.files); e.target.value = "" }}
      />
    </>
  )
}
