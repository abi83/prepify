interface Props {
  blob: string
}

export default function AssetFrame({ blob }: Props) {
  if (!blob) return null
  const src = `data:text/html;charset=utf-8,${encodeURIComponent(blob)}`
  return (
    <div className="mb-4 w-full overflow-hidden rounded-md border border-border bg-muted">
      <iframe
        src={src}
        sandbox="allow-scripts"
        className="block h-[220px] w-full border-none"
        title="Visual asset"
        scrolling="no"
      />
    </div>
  )
}
