import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { checkSongLyrics, createSong, writeSongLyrics, SongApiError, verifyAndStoreMusicAccessCode } from '../api/song'
import type { SongLyricsResponseBody } from '../lib/song'
import { SONG_STYLES, SONG_TONES, targetSecondsForFactCount } from '../lib/song'
import type { SongErrorCode, SongStyle, SongTone } from '../lib/song'
import {
  canGenerateSong,
  canGenerateSongSeconds,
  recordSongGeneration,
  recordSongSecondsUsed,
  MAX_SONG_GENERATIONS_PER_DAY,
  MAX_SONG_SECONDS_PER_DAY,
} from '../lib/songCostGuard'
import { useIsPageActive } from '../hooks/usePageActive'
import { getStoredOwnerAccessCode, clearStoredOwnerAccessCode } from '../lib/ownerAccessCode'
import { saveSong } from '../lib/songStorage'
import type { StoredSong } from '../lib/songStorage'
import SongPlayerCard from './SongPlayerCard'
import OwnerAccessGate from './OwnerAccessGate'
import { CloseIcon, MusicNoteIcon } from './icons'

type SongStep = 'locked' | 'options' | 'lyrics' | 'creating' | 'player'

interface SongPanelProps {
  open: boolean
  onClose: () => void
  quizId: string
  quizTitle: string
  keyFacts: string[]
  sourceExcerpt: string
  language: string
  /** The active provider's longest supported song — clamps the length estimate shown before
   * generation (see lib/song.ts's targetSecondsForFactCount / maxFactsForTargetSeconds). */
  maxSeconds: number
  /** True in production — gates the flow behind OwnerAccessGate until a valid code is stored. */
  requiresAccessCode?: boolean
  /** Shown next to "Make another" after a song is created — true from the quiz result view's entry
   * point, false/omitted when the panel is already embedded in the Songs page itself. */
  showSeeAllSongsLink?: boolean
  /** Called once a song is successfully created and saved, so the Archive row's music icon can
   * reflect it without a full refetch. */
  onSongSaved?: () => void
  /** Fires true on entering the "creating" step and false on leaving it — the Songs page uses this
   * to show a progress row and warn before the tab is closed/reloaded mid-generation. */
  onGeneratingChange?: (isGenerating: boolean) => void
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  return 'audio'
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  )
}

export default function SongPanel({
  open,
  onClose,
  quizId,
  quizTitle,
  keyFacts,
  sourceExcerpt,
  language,
  maxSeconds,
  requiresAccessCode = false,
  showSeeAllSongsLink = false,
  onSongSaved,
  onGeneratingChange,
}: SongPanelProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const [step, setStep] = useState<SongStep>(() => (requiresAccessCode && !getStoredOwnerAccessCode() ? 'locked' : 'options'))
  const [style, setStyle] = useState<SongStyle>('pop')
  const [tone, setTone] = useState<SongTone>('normal')
  const [isWritingLyrics, setIsWritingLyrics] = useState(false)
  const [lyricsResult, setLyricsResult] = useState<SongLyricsResponseBody | null>(null)
  const [draftLyrics, setDraftLyrics] = useState('')
  const [flaggedLines, setFlaggedLines] = useState<number[]>([])
  const [factCheckPassed, setFactCheckPassed] = useState(true)
  const [errorCode, setErrorCode] = useState<SongErrorCode | null>(null)
  const [costGuardReached, setCostGuardReached] = useState(false)
  const [secondsGuardReached, setSecondsGuardReached] = useState(false)
  const [messageIndex, setMessageIndex] = useState(0)
  const [song, setSong] = useState<{ blob: Blob; url: string; lyrics: string; demo: boolean } | null>(null)
  const [storageNote, setStorageNote] = useState(false)

  const loadingMessages = t('song.loading.messages', { returnObjects: true }) as string[]
  const estimatedSeconds = Math.min(targetSecondsForFactCount(keyFacts.length), maxSeconds)

  const pageActive = useIsPageActive()

  // Focus the first control when the panel opens.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    focusableElements(panel)[0]?.focus()
  }, [open])

  // Focus trap + Escape to close (not while another page is shown).
  useEffect(() => {
    if (!open || !pageActive) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = focusableElements(panel)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, pageActive])

  useEffect(() => {
    if (step !== 'creating') return
    const id = setInterval(() => setMessageIndex((index) => (index + 1) % Math.max(1, loadingMessages.length)), 2500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadingMessages is a stable-length array from i18n, re-subscribing on it would just restart the interval pointlessly
  }, [step])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    [],
  )

  useEffect(() => {
    onGeneratingChange?.(step === 'creating')
  }, [step, onGeneratingChange])

  const resetToOptions = () => {
    setStep('options')
    setLyricsResult(null)
    setDraftLyrics('')
    setFlaggedLines([])
    setFactCheckPassed(true)
    setErrorCode(null)
    setCostGuardReached(false)
    setSecondsGuardReached(false)
    setStorageNote(false)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setSong(null)
  }

  const handleClose = () => {
    abortRef.current?.abort()
    onClose()
  }

  const handleWriteLyrics = async () => {
    setErrorCode(null)
    setIsWritingLyrics(true)
    try {
      const result = await writeSongLyrics({ quizTitle, keyFacts, sourceExcerpt, style, tone, language })
      setLyricsResult(result)
      setDraftLyrics(result.lyrics)
      setFlaggedLines(result.flaggedLines)
      setFactCheckPassed(result.factCheckPassed)
      setStep('lyrics')
    } catch (error) {
      if (error instanceof SongApiError && error.code === 'locked') {
        clearStoredOwnerAccessCode()
        setStep('locked')
        return
      }
      setErrorCode(error instanceof SongApiError ? error.code : 'network')
    } finally {
      setIsWritingLyrics(false)
    }
  }

  const handleMakeSong = async () => {
    if (!lyricsResult) return
    if (!canGenerateSong(quizId)) {
      setCostGuardReached(true)
      return
    }
    if (!canGenerateSongSeconds(lyricsResult.targetSeconds)) {
      setSecondsGuardReached(true)
      return
    }
    setCostGuardReached(false)
    setSecondsGuardReached(false)
    setErrorCode(null)

    // Re-check the student's current (possibly edited) lyrics — informational only, never blocking.
    try {
      const recheck = await checkSongLyrics({ mode: 'check', lyrics: draftLyrics, keyFacts, sourceExcerpt, language })
      setFlaggedLines(recheck.flaggedLines)
      setFactCheckPassed(recheck.factCheckPassed)
    } catch {
      // A failed re-check never blocks song creation — keep whatever warning state we already had.
    }

    setStep('creating')
    setMessageIndex(0)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await createSong(
        { lyrics: draftLyrics, musicPrompt: lyricsResult.musicPrompt, style, language, targetSeconds: lyricsResult.targetSeconds },
        controller.signal,
      )
      recordSongGeneration(quizId)
      recordSongSecondsUsed(result.durationSeconds)

      const blob = base64ToBlob(result.audio, result.mimeType)
      const url = URL.createObjectURL(blob)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = url

      setSong({ blob, url, lyrics: result.lyrics, demo: result.demo })
      setStep('player')

      const entry: Omit<StoredSong, 'id' | 'createdAt'> = {
        quizId,
        quizTitle,
        title: lyricsResult.title,
        lyrics: result.lyrics,
        style,
        tone,
        provider: result.provider,
        demo: result.demo,
        mimeType: result.mimeType,
        durationSeconds: result.durationSeconds,
        factCheckPassed,
        audio: blob,
      }
      try {
        await saveSong(entry)
        onSongSaved?.()
      } catch {
        setStorageNote(true)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStep('lyrics')
        return
      }
      if (error instanceof SongApiError && error.code === 'locked') {
        clearStoredOwnerAccessCode()
        setStep('locked')
        return
      }
      setErrorCode(error instanceof SongApiError ? error.code : 'network')
      setStep('lyrics')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const handleCancelCreating = () => {
    abortRef.current?.abort()
  }

  if (!open) return null

  const lyricsTooLong = Boolean(lyricsResult) && draftLyrics.length > lyricsResult!.maxLyricsChars
  const downloadName = `${(quizTitle || 'song').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song'}.${
    song ? extensionForMime(song.blob.type) : 'audio'
  }`
  const draftLyricsLines = draftLyrics.split('\n')

  const factCheckWarning = !factCheckPassed && (
    <div role="status" className="space-y-1.5 rounded-xl border border-amber/30 bg-amber/10 p-3">
      <p className="text-xs font-bold text-amber-text">{t('song.factCheck.warningTitle')}</p>
      {flaggedLines.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-ink">
          {flaggedLines.map((lineIndex) => (
            <li key={lineIndex}>{draftLyricsLines[lineIndex] ?? ''}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink">{t('song.factCheck.genericWarning')}</p>
      )}
    </div>
  )

  return (
    <>
      <button type="button" aria-label={t('song.close')} onClick={handleClose} className="fixed inset-0 z-40 bg-ink/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-panel-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-warm-border bg-card shadow-lg md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:h-full md:max-h-none md:w-full md:max-w-[420px] md:rounded-t-none md:rounded-l-2xl md:border-t-0 md:border-l"
      >
        <div className="flex items-center justify-between border-b border-warm-border p-4">
          <h2 id="song-panel-title" className="font-serif text-lg font-semibold text-navy">
            {t('song.panelTitle')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('song.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-ink"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {step === 'locked' && <OwnerAccessGate onUnlocked={() => setStep('options')} verify={verifyAndStoreMusicAccessCode} />}

          {step === 'options' && (
            <>
              <div className="space-y-2">
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('song.style.label')}</p>
                <div role="radiogroup" aria-label={t('song.style.label')} className="flex flex-wrap gap-2">
                  {SONG_STYLES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={style === option}
                      onClick={() => setStyle(option)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        style === option
                          ? 'border-amber bg-amber/15 text-amber-text'
                          : 'border-warm-border bg-card text-ink hover:border-focus-neutral'
                      }`}
                    >
                      {t(`song.style.${option}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('song.tone.label')}</p>
                <div role="radiogroup" aria-label={t('song.tone.label')} className="flex flex-wrap gap-2">
                  {SONG_TONES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={tone === option}
                      onClick={() => setTone(option)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        tone === option
                          ? 'border-amber bg-amber/15 text-amber-text'
                          : 'border-warm-border bg-card text-ink hover:border-focus-neutral'
                      }`}
                    >
                      {t(`song.tone.${option}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('song.lengthLabel')}</p>
                <p className="text-sm font-medium text-ink">{t('song.lengthNote', { seconds: estimatedSeconds })}</p>
              </div>

              {errorCode && (
                <div role="alert" className="space-y-2 rounded-xl border border-error/40 bg-error/5 p-3">
                  <p className="text-xs font-semibold text-error">{t(`song.errors.${errorCode}`)}</p>
                  <button
                    type="button"
                    onClick={() => void handleWriteLyrics()}
                    className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-bold text-navy hover:border-amber"
                  >
                    {t('song.errors.retry')}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleWriteLyrics()}
                disabled={isWritingLyrics}
                aria-busy={isWritingLyrics}
                className="w-full rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWritingLyrics ? t('song.writingLyrics') : t('song.writeLyrics')}
              </button>
            </>
          )}

          {step === 'lyrics' && lyricsResult && (
            <>
              <p className="text-xs text-muted">{t('song.lengthNote', { seconds: lyricsResult.targetSeconds })}</p>

              {lyricsResult.includedFactsCount < lyricsResult.totalFactsCount && (
                <p className="rounded-xl border border-warm-border bg-paper p-3 text-xs text-muted">
                  {t('song.partialCoverageNote', { included: lyricsResult.includedFactsCount, total: lyricsResult.totalFactsCount })}
                </p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="song-lyrics-textarea" className="text-[11px] font-bold tracking-wide text-muted uppercase">
                  {t('song.lyricsLabel')}
                </label>
                <textarea
                  id="song-lyrics-textarea"
                  value={draftLyrics}
                  onChange={(event) => setDraftLyrics(event.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-warm-border bg-card p-3 font-mono text-sm text-ink"
                />
                <p className={`text-right text-xs ${lyricsTooLong ? 'font-semibold text-error' : 'text-muted'}`}>
                  {t('song.lyricsCounter', { count: draftLyrics.length, max: lyricsResult.maxLyricsChars })}
                </p>
              </div>

              {factCheckWarning}

              {costGuardReached && (
                <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-3 text-xs font-semibold text-error">
                  {t('song.costGuardReached', { max: MAX_SONG_GENERATIONS_PER_DAY })}
                </p>
              )}

              {secondsGuardReached && (
                <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-3 text-xs font-semibold text-error">
                  {t('song.secondsGuardReached', { max: MAX_SONG_SECONDS_PER_DAY })}
                </p>
              )}

              {errorCode && (
                <div role="alert" className="space-y-2 rounded-xl border border-error/40 bg-error/5 p-3">
                  <p className="text-xs font-semibold text-error">{t(`song.errors.${errorCode}`)}</p>
                  <button
                    type="button"
                    onClick={() => void handleMakeSong()}
                    className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-bold text-navy hover:border-amber"
                  >
                    {t('song.errors.retry')}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleMakeSong()}
                disabled={!draftLyrics.trim() || lyricsTooLong}
                className="w-full rounded-xl bg-amber py-3 text-sm font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('song.makeTheSong')}
              </button>
            </>
          )}

          {step === 'creating' && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <MusicNoteIcon className="h-8 w-8 animate-pulse text-amber" />
              <p aria-live="polite" className="text-sm font-medium text-ink">
                {loadingMessages[messageIndex] ?? loadingMessages[0]}
              </p>
              <button
                type="button"
                onClick={handleCancelCreating}
                className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-error/50"
              >
                {t('song.cancel')}
              </button>
            </div>
          )}

          {step === 'player' && song && (
            <>
              <SongPlayerCard audioUrl={song.url} lyrics={song.lyrics} demo={song.demo} downloadName={downloadName} />

              {factCheckWarning}

              {storageNote && <p className="text-xs text-muted">{t('song.errors.storage_full')}</p>}

              <button
                type="button"
                onClick={resetToOptions}
                className="w-full rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber"
              >
                {t('song.player.makeAnother')}
              </button>

              {showSeeAllSongsLink && (
                <Link to="/songs" className="block text-center text-xs font-semibold text-amber-text hover:underline">
                  {t('song.seeAllSongs')}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
