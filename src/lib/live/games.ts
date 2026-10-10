import { useCallback, useEffect, useState } from 'react'

import { isFakeBackend, supabase } from '../supabase'
import type { LiveEndReason, LiveSummary } from './core'
import { LIVE_IDLE_MINUTES, isActiveState } from './core'

/** The signed-in teacher's own games, read through Row Level Security (a teacher only ever sees their own). */

export interface MyLiveGame {
  id: string
  quizId: string
  quizTitle: string
  code: string
  state: string
  endReason: LiveEndReason | null
  questionCount: number
  createdAt: string
  finishedAt: string | null
  summary: LiveSummary | null
  rankingPurged: boolean
  /** Players now in the lobby / game (only filled in for games that are still running). */
  players: number
}

export interface MyLiveGames {
  games: MyLiveGame[]
  loaded: boolean
  failed: boolean
  reload: () => void
}

export function useMyLiveGames(): MyLiveGames {
  const [games, setGames] = useState<MyLiveGame[]>([])
  const [loaded, setLoaded] = useState(isFakeBackend)
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (isFakeBackend) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('live_games')
        .select('id, quiz_id, quiz_title, code, state, end_reason, question_count, created_at, finished_at, last_activity_at, summary, ranking_purged_at')
        .order('created_at', { ascending: false })
        .limit(60)
      if (cancelled) return
      if (error) {
        setFailed(true)
        setLoaded(true)
        return
      }
      // A game nobody touched for 30 minutes is over (the server closes it the next time anyone asks).
      const idle = (game: { state: string; last_activity_at: string }) => isActiveState(game.state) && Date.now() - new Date(game.last_activity_at).getTime() > LIVE_IDLE_MINUTES * 60_000
      const activeIds = data.filter((game) => isActiveState(game.state) && !idle(game)).map((game) => game.id)
      const counts = new Map<string, number>()
      if (activeIds.length > 0) {
        const { data: players } = await supabase.from('live_players').select('game_id').in('game_id', activeIds).eq('removed', false)
        for (const player of players ?? []) counts.set(player.game_id, (counts.get(player.game_id) ?? 0) + 1)
      }
      if (cancelled) return
      setGames(
        data.map((game) => ({
          id: game.id,
          quizId: game.quiz_id,
          quizTitle: game.quiz_title,
          code: game.code,
          state: idle(game) ? 'ended' : game.state,
          endReason: idle(game) ? 'idle' : (game.end_reason as LiveEndReason | null),
          questionCount: game.question_count,
          createdAt: game.created_at,
          finishedAt: game.finished_at,
          summary: game.summary as unknown as LiveSummary | null,
          rankingPurged: game.ranking_purged_at !== null,
          players: counts.get(game.id) ?? 0,
        })),
      )
      setFailed(false)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [version])

  const reload = useCallback(() => {
    setFailed(false)
    setLoaded(false)
    setVersion((value) => value + 1)
  }, [])

  return { games, loaded, failed, reload }
}
