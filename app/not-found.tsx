import Link from "next/link"

import { ErrorState } from "@/components/ErrorState"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <ErrorState
      message="Page not found."
      action={
        <Button variant="link" className="h-auto p-0 text-muted-foreground" asChild>
          <Link href="/">← Home</Link>
        </Button>
      }
    />
  )
}
