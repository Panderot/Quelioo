import { useSearchParams } from 'react-router-dom'

/** A string kept in the URL (e.g. ?q=), so a search or filter survives leaving the page and a reload.
 * Updates replace the history entry, so typing doesn't fill the back button. */
export function useSearchParamState(key: string): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) ?? ''
  const setValue = (next: string) =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next) params.set(key, next)
        else params.delete(key)
        return params
      },
      { replace: true },
    )
  return [value, setValue]
}
