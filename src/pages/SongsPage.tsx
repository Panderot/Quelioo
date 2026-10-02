import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getArchiveEntries } from '../lib/archive'
import type { ArchiveEntry } from '../lib/archive'
import { buildSongKeyFacts } from '../lib/songFacts'
import { MAX_SOURCE_EXCERPT_CHARS } from '../lib/song'
import type { SongTone } from '../lib/song'
import { getStoredOwnerAccessCode, clearStoredOwnerAccessCode } from '../lib/ownerAccessCode'
import { deleteSong, getAllSongs, saveSong } from '../lib/songStorage'
import type { StoredSong } from '../lib/songStorage'
import { remainingSongSecondsToday } from '../lib/songCostGuard'
import { useSongFeatureStatus } from '../hooks/useSongFeatureStatus'
import SongPanel from '../components/SongPanel'
import { ArchiveIcon, ChevronDownIcon, DownloadIcon, LockIcon, MusicNoteIcon, PauseIcon, PlayIcon, SearchIcon, TrashIcon } from '../components/icons'

const UNDO_WINDOW_MS = 6000

function extensionForMime(mimeType: string | undefined): string {
  if (!mimeType) return 'audio'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  return 'audio'
}

function downloadFilename(title: string, mimeType: string | undefined): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'song'
  return `${slug}.${extensionForMime(mimeType)}`
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function SongsPage() {
  const { t, i18n } = useTranslation()
  const status = useSongFeatureStatus()

  const [songs, setSongs] = useState<StoredSong[]>([])
  // Archive entries aren't needed live — just once per page mount, to know which quizzes still
  // exist (for "open quiz" vs "Quiz deleted") and to populate the "New song" quiz picker.
  const archiveEntries = useMemo<ArchiveEntry[]>(() => getArchiveEntries(), [])
  const [hasAccessCode, setHasAccessCode] = useState(() => Boolean(getStoredOwnerAccessCode()))

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const [toneFilter, setToneFilter] = useState<'all' | SongTone>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<{ song: StoredSong; index: number } | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const currentUrlRef = useRef<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const loadSongs = () => {
    void getAllSongs().then(setSongs)
  }

  useEffect(() => {
    loadSongs()
  }, [])

  useEffect(
    () => () => {
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current)
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!isGenerating) return undefined
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isGenerating])

  const archiveById = useMemo(() => new Map(archiveEntries.map((entry) => [entry.id, entry])), [archiveEntries])

  // One object URL per song for the download link, created once per `songs` load and revoked
  // together — recreating one on every render (e.g. inline in the JSX) would leak a blob URL per
  // render instead of per song.
  const downloadUrls = useMemo(() => new Map(songs.map((song) => [song.id, URL.createObjectURL(song.audio)])), [songs])
  useEffect(() => {
    return () => {
      downloadUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [downloadUrls])

  const filteredSongs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return songs.filter((song) => (toneFilter === 'all' || song.tone === toneFilter) && (!query || song.quizTitle.toLowerCase().includes(query)))
  }, [songs, toneFilter, search])

  const filteredPickerEntries = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    return archiveEntries.filter((entry) => !query || entry.title.toLowerCase().includes(query))
  }, [archiveEntries, pickerSearch])

  const songsLeftToday = Math.max(0, Math.floor(remainingSongSecondsToday() / 30))

  if (status && !status.enabled) {
    return <Navigate to="/" replace />
  }

  const handlePickQuiz = (entry: ArchiveEntry) => {
    setSelectedEntry(entry)
    setPickerOpen(false)
    setPickerSearch('')
    setPanelOpen(true)
  }

  const handlePanelClose = () => {
    if (isGenerating) return
    setPanelOpen(false)
  }

  const handleSongSaved = () => {
    loadSongs()
  }

  const togglePlay = (song: StoredSong) => {
    const audio = audioRef.current
    if (!audio) return
    if (playingId === song.id) {
      audio.pause()
      setPlayingId(null)
      return
    }
    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current)
    const url = URL.createObjectURL(song.audio)
    currentUrlRef.current = url
    audio.src = url
    // play() rejects with AbortError when the source changes again before playback actually starts
    // (e.g. rapidly switching tracks) — expected, not a real failure, so swallow it rather than
    // leaving an unhandled rejection.
    audio.play().catch(() => {})
    setPlayingId(song.id)
  }

  const handleDeleteConfirmed = async (song: StoredSong) => {
    const index = songs.findIndex((entry) => entry.id === song.id)
    await deleteSong(song.id)
    if (playingId === song.id) {
      audioRef.current?.pause()
      setPlayingId(null)
    }
    setSongs((current) => current.filter((entry) => entry.id !== song.id))
    setConfirmDeleteId(null)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setDeleted({ song, index })
    undoTimeoutRef.current = setTimeout(() => setDeleted(null), UNDO_WINDOW_MS)
  }

  const handleUndoDelete = async () => {
    if (!deleted) return
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    const song = deleted.song
    const restored = await saveSong({
      quizId: song.quizId,
      quizTitle: song.quizTitle,
      title: song.title,
      lyrics: song.lyrics,
      style: song.style,
      tone: song.tone,
      provider: song.provider,
      demo: song.demo,
      mimeType: song.mimeType,
      durationSeconds: song.durationSeconds,
      factCheckPassed: song.factCheckPassed,
      audio: song.audio,
    })
    setSongs((current) => {
      const next = [...current]
      next.splice(Math.min(deleted.index, next.length), 0, restored)
      return next
    })
    setDeleted(null)
  }

  const handleLock = () => {
    clearStoredOwnerAccessCode()
    setHasAccessCode(false)
  }

  return (
    <>
      <section data-purpose="page-intro" className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">{t('songsPage.title')}</h1>
          <p className="text-sm font-normal text-muted">{t('songsPage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasAccessCode && (
            <button
              type="button"
              onClick={handleLock}
              className="flex items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-error/40 hover:text-error"
            >
              <LockIcon className="h-3.5 w-3.5" />
              {t('ownerAccess.lock')}
            </button>
          )}
          <p className="text-xs font-medium text-muted">{t('songsPage.songsLeftToday', { count: songsLeftToday })}</p>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-amber text-sm font-bold text-navy transition-colors hover:bg-amber-hover"
      >
        <MusicNoteIcon className="h-4 w-4" />
        {t('songsPage.newSong')}
      </button>

      {pickerOpen && (
        <div className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{t('songsPage.pickerTitle')}</p>
            <button type="button" onClick={() => setPickerOpen(false)} className="text-xs font-semibold text-muted hover:text-ink">
              {t('create.question.cancelAction')}
            </button>
          </div>

          {archiveEntries.length === 0 ? (
            <div className="space-y-2 text-center">
              <p className="text-sm text-muted">{t('songsPage.pickerEmpty')}</p>
              <Link to="/" className="text-xs font-semibold text-amber-text hover:underline">
                {t('archive.empty.cta')}
              </Link>
            </div>
          ) : (
            <>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={pickerSearch}
                  onChange={(event) => setPickerSearch(event.target.value)}
                  placeholder={t('songsPage.pickerSearchPlaceholder')}
                  aria-label={t('songsPage.pickerSearchPlaceholder')}
                  className="w-full rounded-lg border border-warm-border bg-paper py-2 pr-3 pl-9 text-sm text-ink"
                />
              </div>
              <ul className="max-h-72 divide-y divide-warm-border overflow-y-auto rounded-lg border border-warm-border">
                {filteredPickerEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => handlePickQuiz(entry)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-paper"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{entry.title}</span>
                      <span className="shrink-0 text-xs text-muted">{t('songsPage.pickerQuestionCount', { count: entry.quiz.questions.length })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {selectedEntry && (
        <SongPanel
          open={panelOpen}
          onClose={handlePanelClose}
          quizId={selectedEntry.id}
          quizTitle={selectedEntry.quiz.title}
          keyFacts={buildSongKeyFacts(selectedEntry.quiz)}
          sourceExcerpt={(selectedEntry.sourceText ?? '').slice(0, MAX_SOURCE_EXCERPT_CHARS)}
          language={selectedEntry.outputLanguage ?? 'auto'}
          maxSeconds={status?.maxSeconds ?? 30}
          requiresAccessCode={status?.requiresAccessCode ?? false}
          onSongSaved={handleSongSaved}
          onGeneratingChange={setIsGenerating}
        />
      )}

      <audio ref={audioRef} className="hidden" onEnded={() => setPlayingId(null)} />

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'normal', 'funny'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setToneFilter(option)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              toneFilter === option ? 'border-amber bg-amber/15 text-amber-text' : 'border-warm-border bg-card text-ink hover:border-focus-neutral'
            }`}
          >
            {t(`songsPage.filters.${option}`)}
          </button>
        ))}
        <div className="relative ml-auto min-w-[180px] flex-1 sm:flex-none">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('songsPage.searchPlaceholder')}
            aria-label={t('songsPage.searchPlaceholder')}
            className="w-full rounded-lg border border-warm-border bg-card py-2 pr-3 pl-9 text-sm text-ink"
          />
        </div>
      </div>

      {isGenerating && selectedEntry && (
        <div className="flex items-center gap-3 rounded-[14px] border border-warm-border bg-card p-4">
          <MusicNoteIcon className="h-5 w-5 shrink-0 animate-pulse text-amber" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{selectedEntry.quiz.title}</p>
            <p className="text-xs text-muted">{t('songsPage.generatingRow')}</p>
          </div>
        </div>
      )}

      {filteredSongs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center">
          <ArchiveIcon className="h-8 w-8 text-muted" />
          <div>
            <p className="text-sm font-semibold text-ink">{t('songsPage.empty.title')}</p>
            <p className="mt-1 text-xs text-muted">{t('songsPage.empty.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-1 rounded-xl bg-amber px-4 py-2 text-xs font-bold text-navy transition-colors hover:bg-amber-hover"
          >
            {t('songsPage.newSong')}
          </button>
        </div>
      ) : (
        <ul data-purpose="songs-list" className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
          {filteredSongs.map((song) => {
            const quizExists = archiveById.has(song.quizId)
            return (
              <li key={song.id} className="space-y-3 p-4 md:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-semibold text-ink">{song.quizTitle}</p>
                    <p className="truncate text-xs text-muted">
                      {[t(`song.style.${song.style}`), t(`song.tone.${song.tone}`), formatDuration(song.durationSeconds), formatDate(song.createdAt, i18n.language)].join(' • ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePlay(song)}
                    aria-label={playingId === song.id ? t('song.player.pause') : t('song.player.play')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber text-navy transition-colors hover:bg-amber-hover"
                  >
                    {playingId === song.id ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === song.id ? null : song.id)}
                    aria-expanded={expandedId === song.id}
                    className="flex items-center gap-1 rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral"
                  >
                    {t(expandedId === song.id ? 'songsPage.row.hideLyrics' : 'songsPage.row.viewLyrics')}
                    <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${expandedId === song.id ? 'rotate-180' : ''}`} />
                  </button>
                  <a
                    href={downloadUrls.get(song.id)}
                    download={downloadFilename(song.quizTitle, song.mimeType)}
                    className="flex items-center gap-1 rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    {t('song.player.download')}
                  </a>
                  {quizExists ? (
                    <Link
                      to={`/archive/${song.quizId}`}
                      className="rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral"
                    >
                      {t('songsPage.row.openQuiz')}
                    </Link>
                  ) : (
                    <span className="rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-muted">
                      {t('songsPage.row.quizDeleted')}
                    </span>
                  )}

                  {confirmDeleteId === song.id ? (
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-xs font-medium text-ink">{t('songsPage.row.confirmDelete')}</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteConfirmed(song)}
                        className="rounded-lg bg-error/10 px-2.5 py-1.5 text-xs font-bold text-error hover:bg-error/20"
                      >
                        {t('songsPage.row.delete')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink"
                      >
                        {t('create.question.cancelAction')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      title={t('songsPage.row.delete')}
                      aria-label={t('songsPage.row.delete')}
                      onClick={() => setConfirmDeleteId(song.id)}
                      className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-error/10 hover:text-error"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {expandedId === song.id && (
                  <div className="rounded-xl border border-warm-border bg-paper p-3 text-sm whitespace-pre-line text-ink">
                    {song.lyrics.split('\n').map((line, index) => {
                      const isTag = /^\[[a-zA-Z]+\]$/.test(line.trim())
                      return isTag ? (
                        <span key={index} className="mb-1 mt-2 inline-block rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-bold text-amber-text first:mt-0">
                          {line.trim()}
                        </span>
                      ) : (
                        <p key={index}>{line}</p>
                      )
                    })}
                  </div>
                )}

                {!song.factCheckPassed && <p className="text-xs text-muted">{t('song.factCheck.genericWarning')}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {deleted && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-warm-border bg-navy px-4 py-3 text-sm text-paper shadow-lg"
        >
          <span>{t('songsPage.deletedUndo')}</span>
          <button type="button" onClick={() => void handleUndoDelete()} className="font-bold text-amber hover:underline">
            {t('create.question.undo')}
          </button>
        </div>
      )}
    </>
  )
}
