export default function ComingSoon({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-12 text-center">
      <p className="text-sm font-semibold">{what} is coming soon</p>
      <p className="text-sm text-muted-foreground">Nothing to show here yet.</p>
    </div>
  )
}
