"use client"

import { useRouter, useSearchParams } from "next/navigation"

/**
 * Reads and writes the current URL's query string, for page state that should be
 * shareable/bookmarkable (filters, tab, progress) instead of living in `useState`.
 */
export function useUrlParams() {
    const router = useRouter()
    const searchParams = useSearchParams()

    function set(updates: Record<string, string | undefined>) {
        const params = new URLSearchParams(searchParams)
        for (const [ key, value ] of Object.entries(updates)) {
            if (value === undefined) params.delete(key)
            else params.set(key, value)
        }
        router.replace(`?${params.toString()}`, { scroll: false })
    }

    return { searchParams, set }
}
