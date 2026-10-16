export default function RejectedPage({ number, reason }: { number: number; reason: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-error px-5 py-3.5">
      <span className="text-sm font-semibold">Page {number}</span>
      <span className="text-sm text-error">{reason}</span>
    </div>
  )
}
