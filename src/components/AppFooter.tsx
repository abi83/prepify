import Link from "next/link"

export default function AppFooter() {
  return (
    <footer className="border-t border-border px-6 py-8">
      <div className="mx-auto flex max-w-[900px] items-center justify-between gap-6">
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="font-highlight text-sm font-bold">Prepify</span>
          <span className="text-xs text-muted-foreground">School educational platform</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="#" className="transition-colors hover:text-foreground">About</Link>
          <Link href="#" className="transition-colors hover:text-foreground">Privacy</Link>
        </nav>
      </div>
    </footer>
  )
}
