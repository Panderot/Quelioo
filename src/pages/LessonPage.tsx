import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { checkLessonEpisode, getLessonStatus, LessonApiError, verifyAndStoreLessonAccessCode, writeLessonEpisode } from '../api/lesson'
import type { LessonClientErrorCode } from '../api/lesson'
import OwnerAccessGate from '../components/OwnerAccessGate'
import LessonAudio from '../components/lessons/LessonAudio'
import ScriptEditor from '../components/lessons/ScriptEditor'
import { CheckIcon, ChevronDownIcon, SpinnerIcon, WarningIcon } from '../components/icons'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { episodeSeconds, formatClock, formatUsd, scriptWordCount } from '../lib/lesson'
import type { ScriptSection } from '../lib/lesson'
import { addLessonSpend, getLesson, lessonCostUsd, putLesson } from '../lib/lessonStorage'
import type { StoredEpisode, StoredLesson } from '../lib/lessonStorage'
import { clearStoredOwnerAccessCode, getStoredOwnerAccessCode } from '../lib/ownerAccessCode'
import { countWords } from '../lib/textStats'

type Busy = { kind: 'checking' | 'writing'; part: number } | null

export default function LessonPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const [lesson, setLesson] = useState<StoredLesson | null | 'missing'>(null)
  const [selectedPart, setSelectedPart] = useState(1)
  const [showKeyPoints, setShowKeyPoints] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<{ part: number; code: LessonClientErrorCode; action: 'check' | 'write' } | null>(null)
  const [locked, setLocked] = useState<number | null>(null)
  const [requiresAccessCode, setRequiresAccessCode] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [recording, setRecording] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useDocumentTitle(lesson && lesson !== 'missing' ? lesson.title : t('lessons.title'))

  useEffect(() => {
    let cancelled = false
    void getLesson(id).then((found) => !cancelled && setLesson(found ?? 'missing'))
    void getLessonStatus().then((status) => !cancelled && setRequiresAccessCode(status.requiresAccessCode))
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [id])

  // Only the latest save may update state after its write: an older, slower write finishing last
  // must not undo a newer change (e.g. a voice picked right after approving).
  const saveCounter = useRef(0)
  const saveLesson = useCallback(async (next: StoredLesson) => {
    const id = ++saveCounter.current
    setLesson(next)
    const saved = await putLesson(next)
    if (id === saveCounter.current) setLesson(saved)
  }, [])

  useEffect(() => {
    if (!busy && !recording) return undefined
    const handler = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [busy, recording])

  if (lesson === null) return null
  if (lesson === 'missing') {
    return (
      <div className="space-y-3 rounded-[14px] border border-warm-border bg-card p-8 text-center">
        <p className="text-sm font-semibold text-ink">{t('lessons.detail.notFound')}</p>
        <Link to="/lessons" className="text-xs font-semibold text-amber-text hover:underline">
          {t('lessons.detail.back')}
        </Link>
      </div>
    )
  }

  const current = lesson
  const isOwnerView = !requiresAccessCode || Boolean(getStoredOwnerAccessCode())
  const episode = current.episodes.find((entry) => entry.part === selectedPart) ?? current.episodes[0]
  const total = current.episodes.length

  const save = saveLesson

  const withEpisode = (base: StoredLesson, part: number, change: (entry: StoredEpisode) => StoredEpisode): StoredLesson => ({
    ...base,
    episodes: base.episodes.map((entry) => (entry.part === part ? change(entry) : entry)),
  })

  const handleEdit = (sections: ScriptSection[]) => {
    const words = scriptWordCount(sections, countWords)
    void save(
      withEpisode(current, episode.part, (entry) =>
        entry.script ? { ...entry, pendingCheck: true, script: { ...entry.script, sections, wordCount: words, estimatedSeconds: episodeSeconds(sections, current.options.language, countWords) } } : entry,
      ),
    )
  }

  const handleFailure = (part: number, action: 'check' | 'write', caught: unknown) => {
    if (caught instanceof DOMException && caught.name === 'AbortError') return
    const code = caught instanceof LessonApiError ? caught.code : 'network'
    if (code === 'locked') {
      clearStoredOwnerAccessCode()
      setLocked(part)
      return
    }
    setError({ part, code, action })
  }

  /** Re-checks the edited (and still flagged) lines of a part against the source; returns the updated lesson. */
  const runCheck = async (base: StoredLesson, part: number, signal: AbortSignal): Promise<StoredLesson> => {
    const target = base.episodes.find((entry) => entry.part === part)
    if (!target?.script) return base
    const script = target.script
    const lineIds = script.sections.flatMap((section) => section.lines).filter((line) => line.edited || line.issue).map((line) => line.id)
    const keyPoints = base.keyPoints.filter((point) => target.keyPointIds.includes(point.id))
    const result = await checkLessonEpisode({ text: base.sourceText, keyPoints, part, sections: script.sections, lineIds, ...base.options }, signal)
    addLessonSpend(result.usage.costUsd)
    const next = withEpisode(base, part, (entry) => ({
      ...entry,
      pendingCheck: false,
      costUsd: (entry.costUsd ?? 0) + result.usage.costUsd,
      script: { ...script, sections: result.sections, check: { ...result.check, rewrittenLineIds: script.check.rewrittenLineIds } },
    }))
    await save(next)
    return next
  }

  const needsCode = () => requiresAccessCode && !getStoredOwnerAccessCode()

  const handleCheck = async (part: number) => {
    if (needsCode()) {
      setLocked(part)
      return
    }
    setError(null)
    setBusy({ kind: 'checking', part })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await runCheck(current, part, controller.signal)
    } catch (caught) {
      handleFailure(part, 'check', caught)
    } finally {
      setBusy(null)
    }
  }

  const handlePrepare = async (part: number) => {
    if (needsCode()) {
      setLocked(part)
      return
    }
    setError(null)
    setSelectedPart(part)
    const controller = new AbortController()
    abortRef.current = controller
    let base = current
    try {
      // Edited lines are re-checked against the source before the next step.
      const previous = base.episodes.find((entry) => entry.part === part - 1)
      if (previous?.pendingCheck) {
        setBusy({ kind: 'checking', part: part - 1 })
        base = await runCheck(base, part - 1, controller.signal)
      }
      setBusy({ kind: 'writing', part })
      const result = await writeLessonEpisode({ text: base.sourceText, keyPoints: base.keyPoints, episodes: base.episodes.map(({ part: p, keyPointIds }) => ({ part: p, keyPointIds })), part, ...base.options }, controller.signal)
      addLessonSpend(result.usage.costUsd)
      await save(withEpisode(base, part, (entry) => ({ ...entry, script: result.episode, costUsd: result.usage.costUsd, cachedShare: result.usage.cachedShare, pendingCheck: false })))
    } catch (caught) {
      handleFailure(part, 'write', caught)
    } finally {
      setBusy(null)
    }
  }

  /** Pending edits are re-checked before recording; null when the check failed (the error is shown). */
  const ensureChecked = async (): Promise<StoredLesson | null> => {
    const controller = new AbortController()
    abortRef.current = controller
    setBusy({ kind: 'checking', part: episode.part })
    try {
      return await runCheck(current, episode.part, controller.signal)
    } catch (caught) {
      handleFailure(episode.part, 'check', caught)
      return null
    } finally {
      setBusy(null)
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    setBusy(null)
  }

  const script = episode.script
  const allLines = script ? script.sections.flatMap((section) => section.lines) : []
  const editedCount = allLines.filter((line) => line.edited).length
  const flaggedCount = allLines.filter((line) => line.issue).length
  const missing = script ? script.check.missingKeyPointIds.filter((pointId) => episode.keyPointIds.includes(pointId)) : []
  const referenced = new Set(script ? script.sections.flatMap((section) => section.keyPointIds) : [])
  const coveredCount = script ? (script.check.ran ? episode.keyPointIds.length - missing.length : episode.keyPointIds.filter((pointId) => referenced.has(pointId)).length) : 0
  const nextEpisode = current.episodes.find((entry) => entry.part === episode.part + 1)

  const whereTaught = (pointId: string): string => {
    const owner = current.episodes.find((entry) => entry.keyPointIds.includes(pointId))
    if (!owner) return t('lessons.detail.notTaught')
    if (!owner.script) return t('lessons.detail.notWritten', { n: owner.part })
    if (owner.script.check.missingKeyPointIds.includes(pointId)) return t('lessons.detail.notTaught')
    // Where it is taught; the recap and self-check sections that repeat it come second.
    const covering = owner.script.sections.filter((section) => section.keyPointIds.includes(pointId))
    const teaching = covering.filter((section) => section.role === 'teach')
    const titles = (teaching.length > 0 ? teaching : covering).map((section) => section.title)
    const where = titles.length > 0 ? titles.join(', ') : t('lessons.detail.partTab', { n: owner.part })
    return total > 1 ? `${t('lessons.detail.partTab', { n: owner.part })} · ${where}` : where
  }

  const busyHere = busy !== null
  const errorHere = error && error.part === episode.part ? error : null

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <Link to="/lessons" className="text-xs font-semibold text-amber-text hover:underline">
          {t('lessons.detail.back')}
        </Link>
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">{current.title}</h1>
        <p className="text-sm text-muted">
          {[t(`lessons.styles.${current.options.style}`), t(`lessons.levels.${current.options.level}`), t(`lessons.tones.${current.options.tone}`), t('lessons.row.episodes', { count: total })].join(' • ')}
        </p>
        {isOwnerView && <p data-purpose="lesson-total-cost" className="text-xs text-muted">{t('lessons.detail.totalCost', { cost: formatUsd(lessonCostUsd(current)) })}</p>}
      </section>

      {total > 1 && (
        <div role="tablist" aria-label={t('lessons.detail.partsLabel')} className="flex flex-wrap items-center gap-2 border-b border-warm-border">
          {current.episodes.map((entry) => {
            const active = entry.part === episode.part
            return (
              <button
                key={entry.part}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedPart(entry.part)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-all ${active ? 'border-amber font-bold text-ink' : 'border-transparent font-semibold text-muted hover:text-ink'}`}
              >
                {t('lessons.detail.partTab', { n: entry.part })}
                {!entry.script && <span className="text-xs font-normal text-muted"> · {t('lessons.detail.notWrittenShort')}</span>}
              </button>
            )
          })}
        </div>
      )}

      {locked === episode.part && (
        <OwnerAccessGate
          verify={verifyAndStoreLessonAccessCode}
          onUnlocked={() => {
            setLocked(null)
          }}
        />
      )}

      {errorHere && (
        <div role="alert" className="space-y-3 rounded-[14px] border border-error/40 bg-error/5 p-4 text-center">
          <p className="text-sm font-semibold text-error">{t(`lessons.errors.${errorHere.code}`)}</p>
          {errorHere.code !== 'rate_limited' && (
            <button
              type="button"
              onClick={() => void (errorHere.action === 'check' ? handleCheck(errorHere.part) : handlePrepare(errorHere.part))}
              className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
            >
              {t('lessons.errors.retry')}
            </button>
          )}
        </div>
      )}

      {busy && busy.kind === 'writing' && busy.part === episode.part && (
        <div role="status" className="flex flex-col items-center gap-2 rounded-[14px] border border-warm-border bg-card p-6 text-center">
          <SpinnerIcon className="h-6 w-6 text-amber" />
          <p className="text-sm font-semibold text-ink">{t('lessons.detail.preparing', { n: busy.part })}</p>
          <button type="button" onClick={cancel} className="text-xs font-semibold text-muted hover:text-ink">
            {t('lessons.new.cancel')}
          </button>
        </div>
      )}

      {!script && !(busy?.kind === 'writing' && busy.part === episode.part) && (
        <div data-purpose="part-not-written" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-6 text-center">
          <p className="text-sm text-ink">{t('lessons.detail.notWrittenYet', { n: episode.part })}</p>
          <button
            type="button"
            disabled={busyHere}
            onClick={() => void handlePrepare(episode.part)}
            className="rounded-xl bg-amber px-5 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('lessons.detail.preparePart', { n: episode.part })}
          </button>
        </div>
      )}

      {script && (
        <>
          <section data-purpose="lesson-summary" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5">
            {total > 1 && <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('lessons.detail.partOf', { n: episode.part, total })}</p>}
            <p className="font-serif text-lg font-semibold text-navy">{script.title}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>{t('lessons.detail.duration', { time: formatClock(script.estimatedSeconds), words: script.wordCount.toLocaleString() })}</span>
              {isOwnerView && episode.costUsd !== null && (
                <span data-purpose="lesson-part-cost">{t('lessons.detail.cost', { cost: formatUsd(episode.costUsd), share: Math.round((episode.cachedShare ?? 0) * 100) })}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowKeyPoints((value) => !value)}
              aria-expanded={showKeyPoints}
              data-purpose="coverage-summary"
              className="flex items-center gap-1.5 text-sm font-semibold text-amber-text hover:underline"
            >
              {t('lessons.detail.coverage', { n: coveredCount, m: episode.keyPointIds.length })}
              <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showKeyPoints ? 'rotate-180' : ''}`} />
            </button>
            {showKeyPoints && (
              <ol data-purpose="key-point-list" className="space-y-2">
                {current.keyPoints.map((point) => (
                  <li key={point.id} className={`rounded-xl border p-3 text-sm ${episode.keyPointIds.includes(point.id) ? 'border-warm-border bg-paper' : 'border-warm-border/60 bg-card text-muted'}`}>
                    <p className="text-ink">{point.text}</p>
                    <p className="mt-1 text-xs text-muted">{t('lessons.detail.taughtIn', { where: whereTaught(point.id) })}</p>
                  </li>
                ))}
              </ol>
            )}

            {script.check.passed && !episode.pendingCheck ? (
              <p data-purpose="check-status" className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <CheckIcon className="h-4 w-4" />
                {t('lessons.detail.checkPassed')}
              </p>
            ) : (
              <div data-purpose="check-status" className="space-y-1 rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs text-ink">
                <p className="flex items-start gap-1.5 font-semibold">
                  <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-text" />
                  {!script.check.ran ? t('lessons.detail.checkNotRun') : episode.pendingCheck ? t('lessons.detail.editedNote', { count: Math.max(1, editedCount) }) : t('lessons.detail.checkFailed', { count: flaggedCount })}
                </p>
                {missing.length > 0 && (
                  <p>{t('lessons.detail.missingPoints', { list: missing.map((pointId) => current.keyPoints.find((point) => point.id === pointId)?.text ?? pointId).join(' · ') })}</p>
                )}
              </div>
            )}
            {script.check.rewrittenLineIds.length > 0 && <p className="text-xs text-muted">{t('lessons.detail.rewritten', { count: script.check.rewrittenLineIds.length })}</p>}

            {episode.pendingCheck && (
              <button
                type="button"
                disabled={busyHere}
                onClick={() => void handleCheck(episode.part)}
                className="flex items-center gap-2 rounded-xl border-2 border-navy px-4 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy?.kind === 'checking' && busy.part === episode.part && <SpinnerIcon className="h-3.5 w-3.5" />}
                {busy?.kind === 'checking' && busy.part === episode.part ? t('lessons.detail.checking') : t('lessons.detail.checkEdits')}
              </button>
            )}
          </section>

          <LessonAudio
            key={episode.part}
            lesson={current}
            episode={episode}
            totalParts={total}
            isOwnerView={isOwnerView}
            onSave={saveLesson}
            ensureChecked={ensureChecked}
            onLocked={() => setLocked(episode.part)}
            needsCode={needsCode}
            onBusyChange={setRecording}
          />

          {episode.hasAudio && (
            <button
              type="button"
              onClick={() => setShowEditor((value) => !value)}
              aria-expanded={showEditor}
              className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-semibold text-ink hover:border-focus-neutral"
            >
              {showEditor ? t('lessons.audio.hideEditor') : t('lessons.audio.editScript')}
            </button>
          )}
          {(!episode.hasAudio || showEditor) && (
            <ScriptEditor key={`editor-${episode.part}`} sections={script.sections} style={current.options.style} part={episode.part} onChange={handleEdit} disabled={busyHere || recording} />
          )}

          {nextEpisode && (
            <div className="flex justify-center">
              {nextEpisode.script ? (
                <button type="button" onClick={() => setSelectedPart(nextEpisode.part)} className="rounded-xl border border-warm-border bg-card px-5 py-2.5 text-sm font-semibold text-ink hover:border-focus-neutral">
                  {t('lessons.detail.goToPart', { n: nextEpisode.part })}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyHere}
                  onClick={() => void handlePrepare(nextEpisode.part)}
                  className="rounded-xl border-2 border-navy px-5 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('lessons.detail.prepareNext', { n: nextEpisode.part })}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
