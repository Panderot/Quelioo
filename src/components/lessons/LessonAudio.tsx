import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LessonApiError, getLessonStatus, speakLessonLines } from '../../api/lesson'
import type { LessonClientErrorCode } from '../../api/lesson'
import { LESSON_SPEAKERS, formatClock, formatUsd } from '../../lib/lesson'
import type { ScriptLine } from '../../lib/lesson'
import {
  PAUSE_SECONDS,
  SPEAK_BATCH_LINES,
  SPEAK_PARALLEL_REQUESTS,
  TTS_MODEL,
  TTS_VOICES,
  estimateSpeechCostUsd,
  estimateSpeechSeconds,
  lessonLines,
  segmentKey,
  spokenText,
  voiceFor,
} from '../../lib/lessonAudio'
import { addLessonSpend, getSegments, monthLessonSpendUsd, putSegment } from '../../lib/lessonStorage'
import type { StoredEpisode, StoredLesson, StoredSegment } from '../../lib/lessonStorage'
import Select from '../Select'
import { MicIcon, SpinnerIcon, VolumeIcon } from '../icons'
import LessonPlayer from './LessonPlayer'

interface LessonAudioProps {
  lesson: StoredLesson
  episode: StoredEpisode
  totalParts: number
  isOwnerView: boolean
  /** Saves a changed lesson (approval, voices, audio cost). */
  onSave: (lesson: StoredLesson) => Promise<void>
  /** Re-checks pending edits before recording; resolves to the updated lesson, or null when it failed. */
  ensureChecked: () => Promise<StoredLesson | null>
  /** Called when the code is missing or wrong. */
  onLocked: () => void
  needsCode: () => boolean
  onBusyChange: (busy: boolean) => void
}

type RecordError = LessonClientErrorCode | 'lines_failed'

/** Preview language for the static voice samples (`public/voices/<model>/<voice>-<lang>.mp3`). */
function previewLanguage(language: string, uiLanguage: string): string {
  const pick = language === 'auto' ? uiLanguage : language
  return ['tr', 'en', 'hyw'].includes(pick) ? pick : 'en'
}

export default function LessonAudio({ lesson, episode, totalParts, isOwnerView, onSave, ensureChecked, onLocked, needsCode, onBusyChange }: LessonAudioProps) {
  const { t, i18n } = useTranslation()
  const uid = useId()
  const script = episode.script!
  const speakers = LESSON_SPEAKERS[lesson.options.style]
  const voices = useMemo(() => Object.fromEntries(speakers.map((speaker) => [speaker, voiceFor(speaker, episode.voices)])), [speakers, episode.voices])
  const lines = useMemo(() => lessonLines(script.sections), [script.sections])
  const keys = useMemo(() => new Map(lines.map((line) => [line.id, segmentKey(line, voices[line.speaker], lesson.options.language)])), [lines, voices, lesson.options.language])

  const [segments, setSegments] = useState<Map<string, StoredSegment> | null>(null)
  const [recording, setRecording] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<RecordError | null>(null)
  const [failedCount, setFailedCount] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const previewRef = useRef<HTMLAudioElement>(null)
  /** Bytes for the player, tagged with the segment set they were read for. */
  const [audioBytes, setAudioBytes] = useState<{ tag: string; bytes: Map<string, Uint8Array> } | null>(null)

  const keyList = useMemo(() => [...new Set(keys.values())], [keys])
  useEffect(() => {
    let cancelled = false
    void getSegments(keyList).then((found) => !cancelled && setSegments(found))
    return () => {
      cancelled = true
    }
  }, [keyList])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => onBusyChange(recording !== null), [recording, onBusyChange])

  const missingLines = useMemo(() => {
    if (!segments) return []
    const seen = new Set<string>()
    return lines.filter((line) => {
      const key = keys.get(line.id)!
      if (segments.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [segments, lines, keys])
  const recordedCount = segments ? lines.filter((line) => segments.has(keys.get(line.id)!)).length : 0
  const complete = segments !== null && recordedCount === lines.length

  // Keep the stored "audio ready" flag in step with what is really recorded for the current text.
  useEffect(() => {
    if (segments === null || Boolean(episode.hasAudio) === complete) return
    void onSave({ ...lesson, episodes: lesson.episodes.map((entry) => (entry.part === episode.part ? { ...entry, hasAudio: complete } : entry)) })
  }, [complete, segments, episode.hasAudio, episode.part, lesson, onSave])

  // Bytes for the player once everything is recorded.
  useEffect(() => {
    if (!complete || !segments) return undefined
    let cancelled = false
    const tag = lines.map((line) => `${line.id}:${keys.get(line.id)}:${line.pause ? 1 : 0}`).join('|')
    void Promise.all(lines.map(async (line) => [line.id, new Uint8Array(await segments.get(keys.get(line.id)!)!.audio.arrayBuffer())] as const)).then((entries) => {
      if (!cancelled) setAudioBytes({ tag, bytes: new Map(entries) })
    })
    return () => {
      cancelled = true
    }
  }, [complete, segments, lines, keys])

  const missingChars = missingLines.reduce((sum, line) => sum + spokenText(line, lesson.options.language).text.length, 0)
  const totalChars = lines.reduce((sum, line) => sum + spokenText(line, lesson.options.language).text.length, 0)
  const estimatedTotalSeconds = estimateSpeechSeconds(totalChars) + lines.filter((line) => line.pause).length * PAUSE_SECONDS

  const saveEpisode = useCallback(
    (base: StoredLesson, change: (entry: StoredEpisode) => StoredEpisode) => onSave({ ...base, episodes: base.episodes.map((entry) => (entry.part === episode.part ? change(entry) : entry)) }),
    [onSave, episode.part],
  )

  const setVoice = (speaker: string, voice: string) => void saveEpisode(lesson, (entry) => ({ ...entry, voices: { ...voices, [speaker]: voice } }))

  const preview = (voice: string) => {
    const audio = previewRef.current
    if (!audio) return
    audio.src = `/voices/${TTS_MODEL}/${voice}-${previewLanguage(lesson.options.language, i18n.language)}.mp3`
    audio.play().catch(() => {})
  }

  const record = async () => {
    if (needsCode()) {
      onLocked()
      return
    }
    setError(null)
    setFailedCount(0)
    const status = await getLessonStatus()
    if (status.monthlyBudgetUsd !== null && monthLessonSpendUsd() + estimateSpeechCostUsd(missingChars) > status.monthlyBudgetUsd) {
      setError('budget')
      return
    }
    let base = lesson
    if (episode.pendingCheck) {
      const checked = await ensureChecked()
      if (!checked) return
      base = checked
    }
    const todo = missingLines
    if (todo.length === 0) return
    const controller = new AbortController()
    abortRef.current = controller
    setRecording({ done: 0, total: todo.length })
    const batches: ScriptLine[][] = []
    for (let index = 0; index < todo.length; index += SPEAK_BATCH_LINES) batches.push(todo.slice(index, index + SPEAK_BATCH_LINES))
    let next = 0
    let done = 0
    let cost = 0
    let failed = 0
    let stop: RecordError | null = null
    const unknown = new Set(episode.unknownAbbreviations ?? [])
    const found = new Map(segments ?? [])
    const worker = async () => {
      while (next < batches.length && !stop && !controller.signal.aborted) {
        const batch = batches[next++]
        try {
          const result = await speakLessonLines(
            { lessonKey: `${base.id}:${episode.part}`, style: base.options.style, language: base.options.language, voices, lines: batch.map(({ id, speaker, text }) => ({ id, speaker, text })) },
            controller.signal,
          )
          for (const segment of result.segments) {
            const line = batch.find((entry) => entry.id === segment.id)
            if (!line) continue
            const stored: StoredSegment = { key: keys.get(line.id)!, audio: new Blob([segment.audio as BlobPart], { type: 'audio/mpeg' }), durationSeconds: segment.durationSeconds, createdAt: new Date().toISOString() }
            await putSegment(stored)
            found.set(stored.key, stored)
          }
          result.unknownAbbreviations.forEach((token) => unknown.add(token))
          cost += result.costUsd
          failed += result.failed.length
          done += result.segments.length
          setRecording({ done, total: todo.length })
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === 'AbortError') return
          stop = caught instanceof LessonApiError ? caught.code : 'network'
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(SPEAK_PARALLEL_REQUESTS, batches.length) }, worker))
    addLessonSpend(cost)
    setSegments(new Map(found))
    setRecording(null)
    await saveEpisode(base, (entry) => ({ ...entry, audioCostUsd: (entry.audioCostUsd ?? 0) + cost, unknownAbbreviations: [...unknown] }))
    if (stop === 'locked') {
      onLocked()
      return
    }
    if (stop) setError(stop)
    else if (failed > 0) {
      setFailedCount(failed)
      setError('lines_failed')
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    setRecording(null)
  }

  if (!episode.approved) {
    return (
      <section data-purpose="lesson-approve" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5">
        <p className="text-sm text-ink">{t('lessons.audio.approveHelp')}</p>
        <button
          type="button"
          onClick={() => void saveEpisode(lesson, (entry) => ({ ...entry, approved: true, voices }))}
          className="rounded-xl bg-amber px-5 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover"
        >
          {t('lessons.audio.approve')}
        </button>
      </section>
    )
  }

  if (segments === null) return null

  const playerTag = lines.map((line) => `${line.id}:${keys.get(line.id)}:${line.pause ? 1 : 0}`).join('|')
  const partLabel = totalParts > 1 ? t('lessons.detail.partTab', { n: episode.part }) : t('lessons.audio.single')

  return (
    <div className="space-y-5">
      {!complete && (
        <section data-purpose="lesson-voices" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5">
          <h2 className="font-serif text-lg font-semibold text-navy">{recordedCount > 0 ? t('lessons.audio.updateHeading') : t('lessons.audio.voicesHeading')}</h2>
          <audio ref={previewRef} className="hidden" />
          {recordedCount === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {speakers.map((speaker) => (
                <div key={speaker} className="space-y-1">
                  <span id={`${uid}-${speaker}`} className="block text-[11px] font-bold tracking-wide text-muted uppercase">
                    {t(`lessons.speakers.${speaker}`)}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select
                        id={`${uid}-${speaker}-select`}
                        labelledBy={`${uid}-${speaker}`}
                        value={voices[speaker]}
                        options={TTS_VOICES.map((voice) => ({ value: voice, label: t(`lessons.voices.${voice}`) }))}
                        onChange={(voice) => setVoice(speaker, voice)}
                        disabled={recording !== null}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => preview(voices[speaker])}
                      aria-label={t('lessons.audio.preview', { voice: t(`lessons.voices.${voices[speaker]}`) })}
                      title={t('lessons.audio.preview', { voice: t(`lessons.voices.${voices[speaker]}`) })}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-warm-border text-ink hover:border-focus-neutral"
                    >
                      <VolumeIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {recordedCount > 0 && <p className="text-sm text-ink">{t('lessons.audio.updateHelp', { count: missingLines.length })}</p>}
          <p data-purpose="audio-estimate" className="text-xs text-muted">
            {t('lessons.audio.estimate', { time: formatClock(estimatedTotalSeconds), cost: formatUsd(estimateSpeechCostUsd(missingChars)), count: missingLines.length })}
          </p>
          {episode.pendingCheck && <p className="text-xs text-muted">{t('lessons.audio.checkFirst')}</p>}

          {recording ? (
            <div role="status" className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <SpinnerIcon className="h-4 w-4 text-amber" />
                <span data-purpose="recording-progress">{t('lessons.audio.recording', { done: recording.done, total: recording.total })}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-warm-border">
                <div className="h-full rounded-full bg-amber transition-all" style={{ width: `${(recording.done / Math.max(1, recording.total)) * 100}%` }} />
              </div>
              <button type="button" onClick={cancel} className="text-xs font-semibold text-muted hover:text-ink">
                {t('lessons.new.cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void record()}
              className="flex items-center gap-2 rounded-xl bg-amber px-5 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover"
            >
              <MicIcon className="h-4 w-4" />
              {recordedCount > 0 ? t('lessons.audio.updateAudio', { count: missingLines.length }) : t('lessons.audio.record')}
            </button>
          )}
          {recordedCount > 0 && !recording && <p className="text-xs text-muted">{t('lessons.audio.progressSaved', { done: recordedCount, total: lines.length })}</p>}

          {error && (
            <div role="alert" className="space-y-2 rounded-xl border border-error/40 bg-error/5 p-3 text-center">
              <p className="text-sm font-semibold text-error">{error === 'lines_failed' ? t('lessons.audio.linesFailed', { count: failedCount }) : t(`lessons.errors.${error}`)}</p>
              {!['daily_cap', 'budget', 'rate_limited'].includes(error) && (
                <button type="button" onClick={() => void record()} className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy hover:border-amber">
                  {t('lessons.errors.retry')}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {complete && audioBytes && audioBytes.tag === playerTag && (
        <LessonPlayer
          key={playerTag}
          title={lesson.title}
          partLabel={partLabel}
          positionKey={`${lesson.id}:${episode.part}`}
          sections={script.sections}
          audioByLine={audioBytes.bytes}
          speakerLabel={(speaker) => t(`lessons.speakers.${speaker}`)}
        />
      )}
      {complete && isOwnerView && (
        <div className="space-y-1 text-xs text-muted">
          {episode.audioCostUsd !== undefined && <p data-purpose="audio-cost">{t('lessons.audio.cost', { cost: formatUsd(episode.audioCostUsd) })}</p>}
          {episode.unknownAbbreviations && episode.unknownAbbreviations.length > 0 && <p data-purpose="unknown-abbreviations">{t('lessons.audio.unknown', { list: episode.unknownAbbreviations.join(', ') })}</p>}
        </div>
      )}
    </div>
  )
}
