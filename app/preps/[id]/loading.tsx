import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-14" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-32" />
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}

        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-44" />
        </div>
      </main>
    </div>
  )
}
