import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Skeleton className="h-4 w-16" />
      </header>

      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <Skeleton className="h-7 w-2/3" />

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </main>
    </div>
  )
}
