import { useState } from "react"

/** Local state that resets to `source` whenever the server hands down a new value; for state also mutated client-side. */
export function useSyncedState<T>(source: T) {
  const [ value, setValue ] = useState(source)
  const [ prevSource, setPrevSource ] = useState(source)
  if (source !== prevSource) {
    setPrevSource(source)
    setValue(source)
  }
  return [ value, setValue ] as const
}
