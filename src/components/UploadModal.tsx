import type { Prisma } from "@prisma/client"
import { useEffect, useRef, useState } from "react"

import { listMyPreps, createPrep, updatePrep, deletePrep } from "@/actions/preps"
import { getUploadSignedUrl } from "@/actions/uploads"
import type { VisualElementOutput } from "@/lib/agents/OcrAgent"
import { runOcrAgent } from "@/lib/agents/OcrAgent"
import { getApiKey } from "@/lib/apiKey"
import { BYOK_TEXT_HARD_LIMIT } from "@/lib/config"
import { consoleLogger } from "@/lib/logger"
import { cn } from "@/lib/utils"
import type { Page } from "@/types/prep"

import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

const MAX_IMAGES = 10
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

type Props = {
  onClose: () => void
  onDone: (prepId: string) => void
}

type Phase = "collect" | "ocr" | "saving" | "error"

async function extractTextFromImage(file: File, apiKey: string, model: string, signal: AbortSignal): Promise<{ text: string; language: string; visual_elements: VisualElementOutput[] }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const { output } = await runOcrAgent([ { base64, mimeType: file.type } ], apiKey, model, signal, consoleLogger)
  return { text: output.text, language: output.language, visual_elements: output.visual_elements }
}

export default function UploadModal({ onClose, onDone }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const draftRef = useRef<Promise<string> | null>(null)
  const savedRef = useRef(false)
  const uploadMapRef = useRef(new Map<File, Promise<string | null>>())
  const nextPageIndexRef = useRef(0)

  const [ files, setFiles ] = useState<File[]>([])
  const [ previews, setPreviews ] = useState<string[]>([])
  const [ phase, setPhase ] = useState<Phase>("collect")

  useEffect(() => {
    // Object URLs are an external resource that must be created and
    // revoked in lockstep with `files` — not derivable during render.
    const urls = files.map(f => URL.createObjectURL(f))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [ files ])

  useEffect(() => {
    return () => {
      if (!savedRef.current && draftRef.current) {
        draftRef.current.then(id => void deletePrep(id)).catch(() => {})
      }
    }
  }, [])

  const [ ocrProgress, setOcrProgress ] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [ errorMsg, setErrorMsg ] = useState("")

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
      setPhase("error")
      setErrorMsg(`${oversized.join(", ")} ${oversized.length === 1 ? "exceeds" : "exceed"} the 5 MB limit. Please use smaller images.`)
      return
    }

    const toAdd = validFiles.slice(0, MAX_IMAGES - files.length)
    if (toAdd.length === 0) return

    setFiles(prev => [ ...prev, ...toAdd ].slice(0, MAX_IMAGES))

    // Create draft prep once on first file pick
    if (draftRef.current === null) {
      draftRef.current = listMyPreps()
        .then(existing => createPrep({ title: `Prep #${existing.length + 1}`, language: null }))
        .then(prep => prep.id)
    }

    // Fire uploads immediately in background; non-fatal if they fail
    for (const file of toAdd) {
      const pageIndex = nextPageIndexRef.current++
      const uploadPromise = draftRef.current
        .then(prepId => getUploadSignedUrl(prepId, pageIndex, file.type))
        .then(({ signedUrl, key }) =>
          fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
            .then(r => (r.ok ? key : null))
        )
        .catch(() => null)
      uploadMapRef.current.set(file, uploadPromise)
    }
  }

  function removeFile(index: number) {
    setFiles(prev => {
      uploadMapRef.current.delete(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleRecognise() {
    if (files.length === 0) return

    const config = getApiKey()
    if (!config) {
      setPhase("error")
      setErrorMsg("No API key configured. Please set one in Settings.")
      return
    }

    if (!draftRef.current) {
      setPhase("error")
      setErrorMsg("Unexpected error. Please try again.")
      return
    }

    let prepId: string
    try {
      prepId = await draftRef.current
    } catch {
      setPhase("error")
      setErrorMsg("Failed to create prep draft. Please try again.")
      return
    }

    // Await all background uploads; failures resolve to null and are non-fatal
    const uploadKeys = await Promise.all(
      files.map(f => uploadMapRef.current.get(f) ?? Promise.resolve(null))
    )

    abortRef.current = new AbortController()
    setPhase("ocr")
    setOcrProgress({ done: 0, total: files.length })

    let results: { text: string; language: string; visual_elements: VisualElementOutput[] }[]
    try {
      results = await Promise.all(
        files.map(async (file) => {
          const result = await extractTextFromImage(file, config.key, config.model, abortRef.current!.signal)
          setOcrProgress(p => ({ ...p, done: p.done + 1 }))
          return result
        })
      )
    } catch (err) {
      setPhase("error")
      const msg = err instanceof Error ? err.message : ""
      setErrorMsg(
        msg.startsWith("low_confidence")
          ? "One of the images is too blurry or dark to read reliably. Please replace it with a clearer photo."
          : "OCR failed. Please try again."
      )
      return
    }

    const pages: Page[] = results.map((r, i) => ({
      page: i + 1,
      text: r.text,
      visual_elements: r.visual_elements,
      ...(uploadKeys[i] !== null ? { gcsKey: uploadKeys[i] as string } : {}),
    }))

    const combinedText = pages.map(p => p.text).join("\n\n")

    if (!combinedText.trim()) {
      setPhase("error")
      setErrorMsg("No text detected in any image. Please try clearer photos.")
      return
    }

    if (combinedText.length > BYOK_TEXT_HARD_LIMIT) {
      setPhase("error")
      setErrorMsg(`Extracted text exceeds the ${(BYOK_TEXT_HARD_LIMIT / 1000).toFixed(0)} 000 character limit. Please use fewer pages.`)
      return
    }

    const language = results[0]?.language ?? "en"

    setPhase("saving")

    try {
      savedRef.current = true
      await updatePrep(prepId, { pages: pages as unknown as Prisma.InputJsonValue, language, isActive: true })
      onDone(prepId)
    } catch {
      savedRef.current = false
      setPhase("error")
      setErrorMsg("Failed to save. Please try again.")
    }
  }

  const isWorking = phase === "ocr" || phase === "saving"
  const canAddMore = files.length < MAX_IMAGES

  return (
    <Dialog open onOpenChange={open => { if (!open && !isWorking) onClose() }}>
      <DialogContent
        showCloseButton={!isWorking}
        onEscapeKeyDown={e => isWorking && e.preventDefault()}
        onPointerDownOutside={e => isWorking && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>New Prep</DialogTitle>
          <DialogDescription className="sr-only">Upload photos of textbook pages to create a new prep.</DialogDescription>
        </DialogHeader>

        {phase === "collect" && (
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
                  {files.map((_, i) => (
                    <div key={i} className="relative overflow-hidden rounded-sm border border-border bg-muted" style={{ aspectRatio: "3 / 4" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL preview, not optimizable by next/image */}
                      <img src={previews[i]} alt={`Page ${i + 1}`} className="block h-full w-full object-cover" />
                      <button
                        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/55 p-0 text-[0.65rem] text-white hover:bg-black/80"
                        onClick={() => removeFile(i)}
                        aria-label={`Remove page ${i + 1}`}
                      >✕</button>
                      <span className="absolute bottom-1 left-[5px] text-[0.65rem] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">{i + 1}</span>
                    </div>
                  ))}
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

            <div className="flex flex-col gap-2.5">
              {files.length === 0 && (
                <Button variant="outline" className="w-full" onClick={() => cameraInputRef.current?.click()}>
                  Take photo
                </Button>
              )}
              {files.length > 0 && (
                <Button className="w-full" onClick={handleRecognise}>
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
        )}

        {(phase === "ocr" || phase === "saving") && (
          <div className="flex flex-col gap-3 py-4">
            <div className="text-sm text-muted-foreground">
              {phase === "ocr"
                ? `Recognising image ${ocrProgress.done + 1} of ${ocrProgress.total}…`
                : "Saving your prep…"}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{
                  width: phase === "saving"
                    ? "100%"
                    : `${ocrProgress.total > 0 ? (ocrProgress.done / ocrProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className={cn("flex flex-col items-center gap-4 py-4 text-center text-error")}>
            <p>{errorMsg}</p>
            <Button variant="outline" onClick={() => { setPhase("collect"); setErrorMsg("") }}>
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
