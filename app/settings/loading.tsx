import { Skeleton } from "@/components/ui/skeleton"

function SectionSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-32" />
    </section>
  )
}

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border px-6 py-4">
        <Skeleton className="h-4 w-16" />
      </header>

      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-10 px-6 py-10">
        <Skeleton className="h-7 w-32" />
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
      </main>
    </div>
  )
}
