import { useRef } from "react"

import { Button } from "./ui/button"

type Props = {
  onFiles: (files: File[]) => void
  variant: "dropzone" | "compact"
}

export function FilePicker({ onFiles, variant }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  function handleFiles(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return
    onFiles(Array.from(incoming))
  }

  return (
    <>
      {variant === "dropzone" ? (
        <>
          <div
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-12 transition-colors hover:border-primary hover:bg-primary/10"
            onClick={() => fileInputRef.current?.click()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
            onDragOver={e => e.preventDefault()}
          >
            <span className="text-4xl">📄</span>
            <p className="text-sm font-medium">Upload photos of textbook pages</p>
            <p className="text-xs text-muted-foreground">Tap to select · or drag & drop</p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => cameraInputRef.current?.click()}>
            Take photo
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            + Add files
          </Button>
          <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
            + Take photo
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={e => { handleFiles(e.target.files); e.target.value = "" }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={e => { handleFiles(e.target.files); e.target.value = "" }}
      />
    </>
  )
}
