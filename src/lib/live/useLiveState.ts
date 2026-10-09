import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '../supabase'
import { LiveApiError, fetchHostState, fetchPlayerState } from './api'
import type { LiveState } from './core'

/** Keeps a screen in step with the server's game state.
 *
 * The state always comes from the server (`/api/live`), never from a message: Realtime only carries a small "something
 * changed" hint, which makes the client fetch again. So a reload, a sleeping phone or a dropped socket all end the same
 * way: the next fetch (on connect, when the tab is visible again, when the network is back, or on the slow fallback
 * timer) brings the real state. */

export type LiveSource = { kind: 'host'; id: string } | { kind: 'player'; token: string }

export interface LiveSession {
  state: LiveState | null
  /** A failure that will not fix itself (no such game, removed, signed out). */
  error: LiveApiError | null
  /** True while the last request failed because the network is down (the last good state stays on screen). */
  offline: boolean
  /** Realtime connected; with it down the slow polling carries on alone. */
  realtime: boolean
  refresh: () => void
  /** The server's clock now, in epoch ms (corrected for the difference to this device's clock). */
  serverNow: () => number
  /** Takes a fresh state that came back from a command, so the screen does not wait for the next fetch. */
  accept: (state: LiveState) => void
}

const MIN_GAP_MS = 350

function fallbackDelay(state: LiveState | null, source: LiveSource, realtime: boolean): number {
  if (!state) return 2000
  const running = state.game.state === 'question'
  if (source.kind === 'host') return running ? 2500 : 5000
  if (state.game.state === 'finished' || state.game.state === 'ended') return 20000
  return realtime ? 10000 : running ? 2000 : 4000
}

export function useLiveState(source: LiveSource | null): LiveSession {
  const [state, setState] = useState<LiveState | null>(null)
  const [error, setError] = useState<LiveApiError | null>(null)
  const [offline, setOffline] = useState(false)
  const [realtime, setRealtime] = useState(false)

  const stateRef = useRef<LiveState | null>(null)
  const offsetRef = useRef(0)
  const inflight = useRef(false)
  const queued = useRef(false)
  const lastFetch = useRef(0)
  const trailing = useRef<number | null>(null)
  const sourceRef = useRef(source)
  const realtimeRef = useRef(false)
  const fatal = useRef(false)
  const loadRef = useRef<() => Promise<void>>(async () => undefined)

  useEffect(() => {
    sourceRef.current = source
    realtimeRef.current = realtime
  })

  const sourceKey = source ? (source.kind === 'host' ? `host:${source.id}` : `player:${source.token}`) : ''

  const apply = useCallback((next: LiveState) => {
    stateRef.current = next
    setState(next)
  }, [])

  /** Fetch now, or soon: at most one request at a time and one every MIN_GAP_MS, with a trailing one so no change is lost. */
  const refresh = useCallback(() => {
    const wait = MIN_GAP_MS - (Date.now() - lastFetch.current)
    if (wait <= 0) {
      void loadRef.current()
      return
    }
    if (trailing.current !== null) return
    trailing.current = window.setTimeout(() => {
      trailing.current = null
      void loadRef.current()
    }, wait)
  }, [])

  useEffect(() => {
    loadRef.current = async () => {
      const current = sourceRef.current
      if (!current || fatal.current) return
      if (inflight.current) {
        queued.current = true
        return
      }
      inflight.current = true
      lastFetch.current = Date.now()
      try {
        const sent = Date.now()
        const next = current.kind === 'host' ? await fetchHostState(current.id) : await fetchPlayerState(current.token)
        offsetRef.current = next.serverNow - (sent + Date.now()) / 2
        apply(next)
        setOffline(false)
        setError(null)
      } catch (caught) {
        if (caught instanceof LiveApiError && [401, 403, 404].includes(caught.status)) {
          fatal.current = true
          setError(caught)
        } else {
          setOffline(true)
        }
      } finally {
        inflight.current = false
        if (queued.current) {
          queued.current = false
          refresh()
        }
      }
    }
  }, [apply, refresh])

  // First fetch for this source (callers give the component a `key` per source, so a new source starts from a clean slate).
  useEffect(() => {
    fatal.current = false
    queued.current = false
    if (!sourceKey) return
    void loadRef.current()
    return () => {
      if (trailing.current !== null) window.clearTimeout(trailing.current)
      trailing.current = null
    }
  }, [sourceKey])

  // Slow fallback polling, plus a fetch whenever the page comes back or the network returns.
  useEffect(() => {
    if (!sourceKey) return
    let timer: number | null = null
    const loop = () => {
      const current = sourceRef.current
      if (!current) return
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') void loadRef.current()
        loop()
      }, fallbackDelay(stateRef.current, current, realtimeRef.current))
    }
    const wake = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    loop()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
    }
  }, [sourceKey, refresh])

  // Realtime hints.
  const channelKey = state?.game.channelKey ?? ''
  const role = state?.role ?? 'player'
  useEffect(() => {
    if (!channelKey) return
    const topics = role === 'host' ? [`live:${channelKey}`, `liveh:${channelKey}`] : [`live:${channelKey}`]
    const up = new Set<string>()
    const channels = topics.map((topic) => {
      const channel = supabase.channel(topic, { config: { broadcast: { self: false } } })
      channel
        .on('broadcast', { event: 'rev' }, ({ payload }) => {
          const hint = payload as { rev?: unknown; tick?: unknown } | null
          const known = stateRef.current?.rev ?? -1
          if (hint?.tick === true || (typeof hint?.rev === 'number' && hint.rev > known)) refresh()
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            up.add(topic)
            // Whatever happened while the socket was down is in the database: fetch it.
            refresh()
          } else {
            up.delete(topic)
          }
          setRealtime(up.size === topics.length)
        })
      return channel
    })
    return () => {
      setRealtime(false)
      for (const channel of channels) void supabase.removeChannel(channel)
    }
  }, [channelKey, role, refresh])

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  return { state, error, offline, realtime, refresh, serverNow, accept: apply }
}

/** Milliseconds left on the open question (the server's clock), or null when no question is running. Ticks every 100 ms. */
export function useRemainingMs(state: LiveState | null, serverNow: () => number): number | null {
  const deadline = state?.game.deadlineAt ?? null
  const pausedRemaining = state?.game.paused ? state.game.pausedRemainingMs : null
  const [, setTick] = useState(0)
  useEffect(() => {
    if (deadline === null) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 100)
    return () => window.clearInterval(timer)
  }, [deadline])
  if (state?.game.state !== 'question') return null
  if (pausedRemaining !== null) return pausedRemaining
  if (deadline === null) return null
  return Math.max(0, deadline - serverNow())
}
