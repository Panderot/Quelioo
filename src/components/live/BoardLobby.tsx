import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getPublicSiteUrl } from '../../lib/publicSite'
import { formatCode } from '../../lib/live/core'
import type { LiveHostPlayer, LiveState } from '../../lib/live/core'
import { LockIcon, XIcon } from '../icons'
import ConfirmDialog from './ConfirmDialog'
import QrCode from './QrCode'

interface BoardLobbyProps {
  state: LiveState
  busy: boolean
  onStart: () => void
  onToggleLock: () => void
  onCancelGame: () => void
  onRemove: (player: LiveHostPlayer) => void
}

/** The lobby on the projector: a huge code, the QR code, the address and everyone who joined so far. */
export default function BoardLobby({ state, busy, onStart, onToggleLock, onCancelGame, onRemove }: BoardLobbyProps) {
  const { t } = useTranslation()
  const [removing, setRemoving] = useState<LiveHostPlayer | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const players = state.players ?? []
  const { code, locked } = state.game
  const siteUrl = getPublicSiteUrl()
  const joinUrl = `${siteUrl}/katil/${code}`
  const address = `${siteUrl.replace(/^https?:\/\//, '')}/katil`

  return (
    <div data-purpose="live-lobby" className="mx-auto flex w-full max-w-[1700px] flex-1 flex-col gap-8 px-6 py-8 lg:px-12">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4 text-center lg:text-left">
          <p className="text-xl font-bold tracking-wide text-muted uppercase">{t('live.board.lobby.joinAt')}</p>
          <p data-purpose="live-join-address" className="font-serif text-4xl font-semibold text-navy md:text-5xl">
            {address}
          </p>
          <p className="pt-2 text-xl font-bold tracking-wide text-muted uppercase">{t('live.board.lobby.codeLabel')}</p>
          <p data-purpose="live-game-code" aria-label={code.split('').join(' ')} className="font-serif text-[clamp(4.5rem,13vw,11rem)] leading-none font-semibold tracking-[0.08em] text-navy tabular-nums">
            {formatCode(code)}
          </p>
        </div>
        <div className="mx-auto flex flex-col items-center gap-3">
          <QrCode value={joinUrl} className="h-[clamp(14rem,26vw,24rem)] w-[clamp(14rem,26vw,24rem)] rounded-2xl border border-warm-border" />
          <p className="text-lg font-semibold text-muted">{t('live.board.lobby.scan')}</p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 data-purpose="live-player-count" aria-live="polite" className="font-serif text-3xl font-semibold text-navy md:text-4xl">
            {t('live.board.lobby.count', { count: players.length })}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {locked && (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber/15 px-4 py-2 text-lg font-bold text-amber-text">
                <LockIcon className="h-5 w-5" />
                {t('live.board.lobby.lockedBadge')}
              </span>
            )}
            <button
              type="button"
              onClick={onToggleLock}
              disabled={busy}
              className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-lg font-semibold text-ink hover:border-amber disabled:opacity-60"
            >
              {locked ? t('live.board.lobby.unlock') : t('live.board.lobby.lock')}
            </button>
            <button type="button" onClick={() => setCancelling(true)} className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-lg font-semibold text-ink hover:border-error">
              {t('live.board.lobby.closeGame')}
            </button>
            <button
              type="button"
              data-purpose="live-start"
              onClick={onStart}
              disabled={busy || players.length < 1}
              className="min-h-14 rounded-xl bg-amber px-8 text-2xl font-bold text-navy hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('live.board.lobby.start')}
            </button>
          </div>
        </div>

        {players.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-warm-border p-10 text-center text-2xl text-muted">{t('live.board.lobby.empty')}</p>
        ) : (
          <ul data-purpose="live-player-list" className="flex flex-wrap gap-3">
            {players.map((player) => (
              <li key={player.id} className="inline-flex items-center gap-1 rounded-full border border-warm-border bg-card py-1.5 pr-1.5 pl-5 text-2xl font-semibold text-ink">
                <span>{player.nickname}</span>
                <button
                  type="button"
                  onClick={() => setRemoving(player)}
                  aria-label={`${t('live.board.lobby.remove')} — ${player.nickname}`}
                  className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-error/10 hover:text-error"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {players.length < 1 && <p className="text-base text-muted">{t('live.board.lobby.needPlayer')}</p>}
      </section>

      {removing && (
        <ConfirmDialog
          title={t('live.board.lobby.removeTitle', { name: removing.nickname })}
          body={t('live.board.lobby.removeBody')}
          confirmLabel={t('live.board.lobby.removeYes')}
          cancelLabel={t('live.board.lobby.cancel')}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onRemove(removing)
            setRemoving(null)
          }}
        />
      )}
      {cancelling && (
        <ConfirmDialog
          title={t('live.board.lobby.closeTitle')}
          body={t('live.board.lobby.closeBody')}
          confirmLabel={t('live.board.lobby.closeYes')}
          cancelLabel={t('live.board.lobby.cancel')}
          onCancel={() => setCancelling(false)}
          onConfirm={() => {
            setCancelling(false)
            onCancelGame()
          }}
        />
      )}
    </div>
  )
}
