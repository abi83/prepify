import type { Prisma } from "@prisma/client"
import { useEffect, useRef, useState } from "react"

import { updatePrep, deletePrep } from "@/actions/preps"
import type { VisualElementOutput } from "@/lib/agents/OcrAgent"
import { runOcrAgent } from "@/lib/agents/OcrAgent"
import { getApiKey } from "@/lib/apiKey"
import { BYOK_TEXT_HARD_LIMIT } from "@/lib/config"
import { consoleLogger } from "@/lib/logger"
import { cn } from "@/lib/utils"
import type { Page } from "@/types/prep"

import { FilePicker, type RecogniseArgs } from "./FilePicker"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

type Props = {
  onClose: () => void
  onDone: (prepId: string) => void
}

type Phase = "ocr" | "saving" | "error"

async function extractTextFromImage(
  file: File,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<{ text: string; language: string; visual_elements: VisualElementOutput[] }> {
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
  const abortRef = useRef<AbortController | null>(null)
  // Set when OCR starts; used to delete the draft if we abort before saving.
  const pendingPrepIdRef = useRef<string | null>(null)
  const savedRef = useRef(false)

  const [ phase, setPhase ] = useState<Phase | null>(null)
  const [ ocrProgress, setOcrProgress ] = useState({ done: 0, total: 0 })
  const [ errorMsg, setErrorMsg ] = useState("")

  useEffect(() => {
    return () => {
      if (!savedRef.current && pendingPrepIdRef.current) {
        void deletePrep(pendingPrepIdRef.current)
      }
    }
  }, [])

  async function handleRecognise({ prepId, files, uploadKeys }: RecogniseArgs) {
    const config = getApiKey()
    if (!config) {
      setPhase("error")
      setErrorMsg("No API key configured. Please set one in Settings.")
      return
    }

    pendingPrepIdRef.current = prepId
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

  function handleRetry() {
    // Draft from the failed attempt is now orphaned — clean it up before re-showing the picker.
    if (!savedRef.current && pendingPrepIdRef.current) {
      void deletePrep(pendingPrepIdRef.current)
      pendingPrepIdRef.current = null
    }
    setPhase(null)
    setErrorMsg("")
  }

  const isWorking = phase === "ocr" || phase === "saving"

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

        {phase === null && <FilePicker onRecognise={handleRecognise} />}

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
            <Button variant="outline" onClick={handleRetry}>
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
