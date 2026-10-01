import { useEffect, useState } from 'react'

import { getSongStatus } from '../api/song'
import type { SongStatusResponseBody } from '../lib/song'

/** Shares the module-cached GET /api/song result (src/api/song.ts) — the Sidebar's "Songs" item and
 * the /songs route guard both need this without triggering a second fetch. Null while loading. */
export function useSongFeatureStatus(): SongStatusResponseBody | null {
  const [status, setStatus] = useState<SongStatusResponseBody | null>(null)

  useEffect(() => {
    let cancelled = false
    void getSongStatus().then((result) => {
      if (!cancelled) setStatus(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return status
}
