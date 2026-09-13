import { useSyncExternalStore } from 'react'
import { vi } from 'vitest'

/**
 * A `next/navigation` mock whose `useSearchParams()` actually reacts to `router.replace(url)` —
 * needed for components that derive state from the URL instead of `useState`.
 */
export function createNavigationMock() {
  const mockPush = vi.fn()
  let searchParams = new URLSearchParams()
  const listeners = new Set<() => void>()

  function replace(url: string) {
    searchParams = new URLSearchParams(url.split('?')[1] ?? '')
    listeners.forEach(listener => listener())
  }

  function useRouter() {
    return { push: mockPush, replace }
  }

  function useSearchParams() {
    return useSyncExternalStore(
      onChange => {
        listeners.add(onChange)
        return () => listeners.delete(onChange)
      },
      () => searchParams,
    )
  }

  return { mockPush, useRouter, useSearchParams }
}
