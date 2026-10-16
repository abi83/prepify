import { useSyncExternalStore } from "react"

import { pageIndexOf, uploadPrepImage } from "./prepImageUpload"

/** Module-level so in-flight uploads outlive the component that started them (modal → prep page soft navigation). A hard reload drops it. */
export type UploadState = { status: "uploading" } | { status: "done"; imageId: string } | { status: "error" }

export type UploadEntry = { pageIndex: number; file: File; state: UploadState }

type PrepQueue = { nextPageIndex: number; entries: UploadEntry[] }

const NO_ENTRIES: UploadEntry[] = []

const queues = new Map<string, PrepQueue>()
const listeners = new Set<() => void>()

function update(prepId: string, change: (queue: PrepQueue) => PrepQueue) {
  queues.set(prepId, change(queues.get(prepId) ?? { nextPageIndex: 0, entries: NO_ENTRIES }))
  listeners.forEach(listener => listener())
}

function setState(prepId: string, pageIndex: number, state: UploadState) {
  update(prepId, queue => ({
    ...queue,
    entries: queue.entries.map(e => e.pageIndex === pageIndex ? { ...e, state } : e),
  }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Starts uploading `files`; page indices continue after both the queue's and `persistedKeys`' highest, so GCS keys never collide. */
export function enqueueUploads(prepId: string, files: File[], persistedKeys: string[]) {
  const persistedNext = Math.max(-1, ...persistedKeys.map(pageIndexOf)) + 1
  const first = Math.max(queues.get(prepId)?.nextPageIndex ?? 0, persistedNext)
  const added = files.map((file, i): UploadEntry => ({ pageIndex: first + i, file, state: { status: "uploading" } }))

  update(prepId, queue => ({ nextPageIndex: first + files.length, entries: [ ...queue.entries, ...added ] }))

  for (const { pageIndex, file } of added) {
    uploadPrepImage(prepId, pageIndex, file).then(
      image => setState(prepId, pageIndex, { status: "done", imageId: image.id }),
      (e: unknown) => {
        console.error(e)
        setState(prepId, pageIndex, { status: "error" })
      },
    )
  }
}

export function removeUpload(prepId: string, pageIndex: number) {
  update(prepId, queue => ({ ...queue, entries: queue.entries.filter(e => e.pageIndex !== pageIndex) }))
}

export function clearUploads(prepId: string) {
  update(prepId, queue => ({ ...queue, entries: NO_ENTRIES }))
}

/** Drops finished uploads whose rows now arrive from the server, freeing their `File`s. */
export function pruneUploaded(prepId: string, persistedImageIds: string[]) {
  const entries = queues.get(prepId)?.entries ?? NO_ENTRIES
  const isPersisted = (e: UploadEntry) => e.state.status === "done" && persistedImageIds.includes(e.state.imageId)
  if (!entries.some(isPersisted)) return
  update(prepId, queue => ({ ...queue, entries: queue.entries.filter(e => !isPersisted(e)) }))
}

export function useUploads(prepId: string | null): UploadEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => (prepId && queues.get(prepId)?.entries) || NO_ENTRIES,
    () => NO_ENTRIES,
  )
}
