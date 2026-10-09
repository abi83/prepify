import { useRef, useState } from "react"

import { updatePrep } from "@/actions/preps"
import { getApiKey } from "@/lib/apiKey"
import { BYOK_TEXT_HARD_LIMIT } from "@/lib/config"
import { consoleLogger } from "@/lib/logger"
import type { OcrFileResult } from "@/lib/prepImageOcr"
import { ocrImageFile } from "@/lib/prepImageOcr"
import { cn } from "@/lib/utils"

import { FilePicker, type RecogniseArgs } from "./FilePicker"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

type Props = {
  onClose: () => void
  onDone: (prepId: string) => void
}

type Phase = "ocr" | "saving" | "error"

export default function UploadModal({ onClose, onDone }: Props) {
  const abortRef = useRef<AbortController | null>(null)

  const [ phase, setPhase ] = useState<Phase | null>(null)
  const [ ocrProgress, setOcrProgress ] = useState({ done: 0, total: 0 })
  const [ errorMsg, setErrorMsg ] = useState("")

  async function handleRecognise({ prepId, files, images }: RecogniseArgs) {
    const config = getApiKey()
    if (!config) {
      setPhase("error")
      setErrorMsg("No API key configured. Please set one in Settings.")
      return
    }

    abortRef.current = new AbortController()
    setPhase("ocr")
    setOcrProgress({ done: 0, total: files.length })

    const results = await Promise.all(
      files.map(async (file, i) => {
        const image = images[i]
        if (!image) return null
        const result = await ocrImageFile(file, image.id, config.key, config.model, config.tier, abortRef.current!.signal, consoleLogger)
        setOcrProgress(p => ({ ...p, done: p.done + 1 }))
        return result
      })
    )

    const succeeded = results.filter((r): r is OcrFileResult => r !== null)
    const combinedText = succeeded.map(r => r.text).join("\n\n")

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

    const language = succeeded[0].language
    setPhase("saving")

    try {
      await updatePrep(prepId, { language, isActive: true })
      onDone(prepId)
    } catch {
      setPhase("error")
      setErrorMsg("Failed to save. Please try again.")
    }
  }

  function handleRetry() {
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
