import { listMyPrepImages } from "@/actions/prepImages"
import { loadMyPrepState } from "@/actions/prepState"
import { loadMyQuestion } from "@/actions/questions"
import { getReadSignedUrl } from "@/actions/uploads"
import type { PrepData } from "@/core/ports"

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/** `PrepData` over server actions (state, image rows) and signed-URL downloads from the browser. */
export const browserPrepData: PrepData = {
  loadState: loadMyPrepState,
  listImages: listMyPrepImages,
  loadQuestion: loadMyQuestion,
  async downloadImage(prepId, gcsKey) {
    const blob = await fetch(await getReadSignedUrl(prepId, gcsKey)).then(r => r.blob())
    return { base64: await blobToBase64(blob), mimeType: blob.type }
  },
}
