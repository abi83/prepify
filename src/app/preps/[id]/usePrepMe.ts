import { useRef, useState } from "react"

import { listMyPrepImages } from "@/actions/prepImages"
import { updatePrep } from "@/actions/preps"
import { BYOK_TEXT_HARD_LIMIT } from "@/core/lib/config"
import { getGenerationConfig, type GenerationConfig } from "@/core/lib/generationConfig"
import { runOcr } from "@/lib/jobs/client/clientExecution"
import { consoleLogger } from "@/lib/logger"
import { clientSampler } from "@/lib/sampler/clientSampler"
import { ocrResultSchema } from "@/types/prep"

import { useRunTrigger, type RunRequest } from "./useRunTrigger"

type Phase = "ocr" | "starting" | "saving" | "error"

/** The "Prep me" flow of a draft prep: run trigger with OCR → activate. */
export function usePrepMe(prepId: string, imageCount: number) {
  const abortRef = useRef<AbortController | null>(null)

  const [ phase, setPhase ] = useState<Phase | null>(null)
  const [ ocrProgress, setOcrProgress ] = useState({ done: 0, total: 0 })
  const [ errorMsg, setErrorMsg ] = useState("")
  const [ config, setConfig ] = useState<GenerationConfig>(() => getGenerationConfig())

  const trigger = useRunTrigger(prepId, {
    onError: message => {
      setPhase("error")
      setErrorMsg(message)
    },
    onFinished: () => setPhase(null),
  })

  async function recogniseInBrowser({ actorId, keyConfig }: Parameters<RunRequest["runInBrowser"]>[0]) {
    abortRef.current = new AbortController()
    setPhase("ocr")
    setOcrProgress({ done: 0, total: imageCount })

    await runOcr({
      actorId,
      prepId,
      apiKey: keyConfig.key,
      model: keyConfig.model,
      tier: keyConfig.tier,
      target: config,
      signal: abortRef.current.signal,
      logger: consoleLogger,
      sampler: clientSampler,
      onProgress: event => {
        if (event.stage === "ocr") setOcrProgress({ done: event.done, total: event.total })
      },
    })

    const images = await listMyPrepImages(prepId)
    const combinedText = images.map(image => ocrResultSchema.parse(image.ocrResult).text).join("\n\n")

    if (!combinedText.trim()) throw new Error("No text detected in any image. Please try clearer photos.")
    if (combinedText.length > BYOK_TEXT_HARD_LIMIT) {
      throw new Error(`Extracted text exceeds the ${(BYOK_TEXT_HARD_LIMIT / 1000).toFixed(0)} 000 character limit. Please use fewer pages.`)
    }

    setPhase("saving")
    try {
      await updatePrep(prepId, { isActive: true })
    } catch {
      throw new Error("Failed to save. Please try again.")
    }
  }

  function start() {
    trigger.run({
      config,
      beforeServerRun: async () => {
        setPhase("starting")
        await updatePrep(prepId, { isActive: true })
      },
      runInBrowser: recogniseInBrowser,
    })
  }

  function retry() {
    setPhase(null)
    setErrorMsg("")
  }

  return { phase, ocrProgress, errorMsg, modeDialogOpen: trigger.modeDialogOpen, config, setConfig, start, confirmMode: trigger.confirmMode, retry }
}
