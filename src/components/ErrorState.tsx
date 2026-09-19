import type { ReactNode } from "react"

/** Shared shell for a full-page error/empty state: a message, centered, with an optional action below it. */
export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
            <p>{message}</p>
            {action}
        </div>
    )
}
