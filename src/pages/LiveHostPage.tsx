import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import BoardFinal from '../components/live/BoardFinal'
import BoardLobby from '../components/live/BoardLobby'
import BoardQuestion from '../components/live/BoardQuestion'
import { playLiveSound } from '../components/live/sounds'
import { VolumeIcon } from '../components/icons'
import { LogoMark } from '../components/Logo'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { createLiveGame, sendHostCommand } from '../lib/live/api'
import { LIVE_ANSWER_GRACE_MS, formatCode } from '../lib/live/core'
import type { LiveHostPlayer } from '../lib/live/core'
import { useLiveState, useRemainingMs } from '../lib/live/useLiveState'

/** The teacher's board (/live/:id): lobby, questions, reveals and the podium on the projector. It is a full-window
 * layer above the app shell, and everything on it comes from the server, so a reload returns to the same moment. */
export default function LiveHostPage() {
  const { id } = useParams<{ id: string }>()
  return <LiveBoard key={id} id={id} />
}

function LiveBoard({ id }: { id: string | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useLiveState(id ? { kind: 'host', id } : null)
  const { state, error, offline, realtime, refresh, serverNow, accept } = session
  const remaining = useRemainingMs(state, serverNow)
  const [busy, setBusy] = useState(false)
  const [soundChoice, setSoundChoice] = useState<boolean | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  useDocumentTitle(state?.game.quizTitle || t('live.hub.title'))

  const soundOn = soundChoice ?? state?.game.settings.sound ?? false
  const busyRef = useRef(false)

  const run = useCallback(
    async (command: string, extra: Record<string, unknown> = {}) => {
      if (!id || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        accept(await sendHostCommand(id, command, extra))
      } catch {
        // The screen shows whatever the server says next; a failed command changes nothing.
        refresh()
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [id, accept, refresh],
  )

  // Time is up: ask the server to look (it flips the question to its reveal once the deadline and the network allowance have passed).
  const deadline = state?.game.deadlineAt ?? null
  useEffect(() => {
    if (deadline === null) return
    const wait = Math.max(0, deadline - serverNow()) + LIVE_ANSWER_GRACE_MS + 120
    const timer = window.setTimeout(refresh, wait)
    return () => window.clearTimeout(timer)
  }, [deadline, refresh, serverNow])

  // Sound effects on the moments that change the room.
  const previous = useRef<{ state: string; index: number; players: number } | null>(null)
  const gameState = state?.game.state
  const currentIndex = state?.game.currentIndex ?? -1
  const playerCount = state?.counts.players ?? 0
  useEffect(() => {
    if (!gameState) return
    const before = previous.current
    previous.current = { state: gameState, index: currentIndex, players: playerCount }
    if (!before || !soundOn) return
    if (gameState === 'lobby' && playerCount > before.players) playLiveSound('join')
    else if (gameState === 'question' && (before.state !== 'question' || before.index !== currentIndex)) playLiveSound('start')
    else if (gameState === 'reveal' && before.state !== 'reveal') playLiveSound('reveal')
    else if (gameState === 'finished' && before.state !== 'finished') playLiveSound('final')
  }, [gameState, currentIndex, playerCount, soundOn])

  // Keyboard: Space or Right arrow moves on, P pauses.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (document.querySelector('[data-purpose="live-confirm"]')) return
      if (!state || (state.game.state !== 'question' && state.game.state !== 'reveal' && state.game.state !== 'lobby')) return
      if (event.key === ' ' || event.key === 'ArrowRight') {
        event.preventDefault()
        if (event.repeat) return
        if (state.game.paused) void run('resume')
        else if (state.game.state === 'lobby' && state.counts.players < 1) return
        else void run('next')
      } else if (event.key === 'p' || event.key === 'P') {
        if (state.game.state !== 'question') return
        event.preventDefault()
        void run(state.game.paused ? 'resume' : 'pause')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, run])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => undefined)
  }

  const [playingAgain, setPlayingAgain] = useState(false)
  const playAgain = async () => {
    if (!state || playingAgain) return
    setPlayingAgain(true)
    try {
      const created = await createLiveGame(state.game.quizId, state.game.settings)
      navigate(`/live/${created.id}`)
    } catch {
      setPlayingAgain(false)
      navigate(`/live/new?quiz=${state.game.quizId}`)
    }
  }

  let content
  if (error) {
    content = (
      <div className="m-auto space-y-4 p-8 text-center">
        <p className="font-serif text-3xl font-semibold text-navy">{t('live.board.notFound')}</p>
        <Link to="/live" className="inline-flex min-h-12 items-center rounded-xl bg-amber px-6 text-lg font-bold text-navy hover:bg-amber-hover">
          {t('live.board.leave')}
        </Link>
      </div>
    )
  } else if (!state) {
    content = (
      <p role="status" className="m-auto p-8 text-2xl text-muted">
        {t('live.board.loading')}
      </p>
    )
  } else if (state.game.state === 'lobby') {
    content = (
      <BoardLobby
        state={state}
        busy={busy}
        onStart={() => void run('start')}
        onToggleLock={() => void run(state.game.locked ? 'unlock' : 'lock')}
        onCancelGame={() => void run('close')}
        onRemove={(player: LiveHostPlayer) => void run('kick', { playerId: player.id })}
      />
    )
  } else if (state.game.state === 'question' || state.game.state === 'reveal') {
    content = (
      <BoardQuestion
        state={state}
        remainingMs={remaining}
        busy={busy}
        onPause={() => void run('pause')}
        onResume={() => void run('resume')}
        onSkip={() => void run('skip')}
        onEndNow={() => void run('end-question')}
        onNext={() => void run('next')}
        onFinish={() => void run('finish')}
      />
    )
  } else {
    content = <BoardFinal state={state} busy={playingAgain} onPlayAgain={() => void playAgain()} />
  }

  return (
    <div data-purpose="live-board" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-warm-border bg-card px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark className="h-8 w-8 shrink-0" tone="onLight" />
          <span className="truncate font-serif text-xl font-semibold text-navy">{state?.game.quizTitle ?? t('live.hub.title')}</span>
          {state && state.game.state !== 'lobby' && state.game.state !== 'finished' && state.game.state !== 'ended' && (
            <span data-purpose="live-header-code" className="rounded-full bg-navy px-4 py-1 text-lg font-bold text-paper tabular-nums">
              {formatCode(state.game.code)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {offline && (
            <span role="status" data-purpose="live-offline" className="rounded-full bg-error/10 px-3 py-1 text-sm font-bold text-error">
              {t('live.board.reconnecting')}
            </span>
          )}
          {!realtime && state && !offline && <span className="sr-only">realtime-off</span>}
          <button
            type="button"
            data-purpose="live-sound-toggle"
            aria-pressed={soundOn}
            aria-label={soundOn ? t('live.board.mute') : t('live.board.unmute')}
            title={soundOn ? t('live.board.mute') : t('live.board.unmute')}
            onClick={() => setSoundChoice(!soundOn)}
            className="relative grid h-11 w-11 place-items-center rounded-xl border border-warm-border text-ink hover:border-amber"
          >
            <VolumeIcon className="h-5 w-5" />
            {!soundOn && <span aria-hidden className="absolute h-0.5 w-6 rotate-45 rounded bg-error" />}
          </button>
          <button type="button" onClick={toggleFullscreen} className="min-h-11 rounded-xl border border-warm-border px-3 text-sm font-semibold text-ink hover:border-amber">
            {fullscreen ? t('live.board.exitFullscreen') : t('live.board.fullscreen')}
          </button>
          <Link to="/live" className="inline-flex min-h-11 items-center rounded-xl border border-warm-border px-3 text-sm font-semibold text-ink hover:border-amber">
            {t('live.board.leave')}
          </Link>
        </div>
      </header>
      {content}
    </div>
  )
}
