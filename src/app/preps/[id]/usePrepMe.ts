import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useRef, useState } from "react"

import { listMyPrepImages } from "@/actions/prepImages"
import { updatePrep } from "@/actions/preps"
import { getApiKey, type ApiKeyConfig } from "@/lib/apiKey"
import { BYOK_TEXT_HARD_LIMIT } from "@/lib/config"
import { getExecutionMode, isExecutionModeSet } from "@/lib/executionMode"
import { getGenerationConfig } from "@/lib/generationConfig"
import { runOcr } from "@/lib/jobs/clientExecution"
import { awaitRunStart, requestServerRun } from "@/lib/jobs/serverRunClient"
import { consoleLogger } from "@/lib/logger"
import { clientSampler } from "@/lib/sampler/clientSampler"
import { ocrResultSchema } from "@/types/prep"

type Phase = "ocr" | "starting" | "saving" | "error"

/** The "Prep me" flow of a draft prep: execution mode → key/session checks → OCR or server run → activate. */
export function usePrepMe(prepId: string, imageCount: number) {
  const router = useRouter()
  const { data: session } = useSession()
  const abortRef = useRef<AbortController | null>(null)

  const [ phase, setPhase ] = useState<Phase | null>(null)
  const [ ocrProgress, setOcrProgress ] = useState({ done: 0, total: 0 })
  const [ errorMsg, setErrorMsg ] = useState("")
  const [ modeDialogOpen, setModeDialogOpen ] = useState(false)

  function fail(message: string) {
    setPhase("error")
    setErrorMsg(message)
  }

  function done() {
    setPhase(null)
    router.refresh()
  }

  async function runOnServer(config: ApiKeyConfig) {
    setPhase("starting")
    try {
      await updatePrep(prepId, { isActive: true })
      await requestServerRun({ apiKey: config.key, prepId, model: config.model, tier: config.tier, target: getGenerationConfig() })
      await awaitRunStart(prepId)
    } catch (e) {
      fail(e instanceof Error ? e.message : "Failed to start the server run")
      return
    }
    done()
  }

  async function proceedWithRecognise() {
    const config = getApiKey()
    if (!config) {
      fail("No API key configured. Please set one in Settings.")
      return
    }
    const actorId = session?.user.id
    if (!actorId) {
      fail("You are not signed in.")
      return
    }

    if (getExecutionMode() === "server") {
      await runOnServer(config)
      return
    }

    abortRef.current = new AbortController()
    setPhase("ocr")
    setOcrProgress({ done: 0, total: imageCount })

    try {
      await runOcr({
        actorId,
        prepId,
        apiKey: config.key,
        model: config.model,
        tier: config.tier,
        target: getGenerationConfig(),
        signal: abortRef.current.signal,
        logger: consoleLogger,
        sampler: clientSampler,
        onProgress: event => {
          if (event.stage === "ocr") setOcrProgress({ done: event.done, total: event.total })
        },
      })
    } catch (e) {
      fail(e instanceof Error ? e.message : "OCR failed")
      return
    }

    const images = await listMyPrepImages(prepId)
    const combinedText = images.map(image => ocrResultSchema.parse(image.ocrResult).text).join("\n\n")

    if (!combinedText.trim()) {
      fail("No text detected in any image. Please try clearer photos.")
      return
    }

    if (combinedText.length > BYOK_TEXT_HARD_LIMIT) {
      fail(`Extracted text exceeds the ${(BYOK_TEXT_HARD_LIMIT / 1000).toFixed(0)} 000 character limit. Please use fewer pages.`)
      return
    }

    setPhase("saving")

    try {
      await updatePrep(prepId, { isActive: true })
    } catch {
      fail("Failed to save. Please try again.")
      return
    }
    done()
  }

  function start() {
    if (!isExecutionModeSet()) {
      setModeDialogOpen(true)
      return
    }
    void proceedWithRecognise()
  }

  function confirmMode() {
    setModeDialogOpen(false)
    void proceedWithRecognise()
  }

  function retry() {
    setPhase(null)
    setErrorMsg("")
  }

  return { phase, ocrProgress, errorMsg, modeDialogOpen, start, confirmMode, retry }
}
