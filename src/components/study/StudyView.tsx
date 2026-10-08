import { useCallback, useEffect, useRef, useState } from 'react'

import { useIsPageActive } from '../../hooks/usePageActive'
import { saveStudyResults } from '../../lib/archive'
import type { ArchiveEntry } from '../../lib/archive'
import { defaultTimer, parseStudyResults, quickPoolIds, withSession } from '../../lib/study'
import type { StudyKind, StudyResults, StudyResume, TimerSetting } from '../../lib/study'
import { loadStudyPrefs, saveStudyPrefs, setStudyChrome } from '../../lib/studyPrefs'
import type { StudyPrefs } from '../../lib/studyPrefs'
import StudyEnd from './StudyEnd'
import StudyRun from './StudyRun'
import type { RunSummary } from './StudyRun'
import StudyStart from './StudyStart'

interface StudyViewProps {
  entry: ArchiveEntry
  /** Leave Study Mode: back to where the student came from. */
  onExit: () => void
  onToArchive: () => void
}

type Screen =
  | { name: 'start' }
  | { name: 'run'; runKey: number; kind: StudyKind; scope: 'full' | 'subset'; qids: string[]; timer: TimerSetting; initial?: StudyResume }
  | { name: 'end'; summary: RunSummary; kind: StudyKind; scope: 'full' | 'subset'; timer: TimerSetting }

/** Study Mode: its own full-width screen (start → one question at a time → end), separate from the quiz editor. */
export default function StudyView({ entry, onExit, onToArchive }: StudyViewProps) {
  const pageActive = useIsPageActive()
  const [results, setResults] = useState<StudyResults>(() => parseStudyResults(entry.results))
  const resultsRef = useRef(results)
  const [prefs, setPrefs] = useState<StudyPrefs>(loadStudyPrefs)
  const [screen, setScreen] = useState<Screen>({ name: 'start' })
  const [focus, setFocus] = useState(false)
  const runCounter = useRef(0)

  const store = useCallback(
    (next: StudyResults) => {
      resultsRef.current = next
      saveStudyResults(entry.id, next)
    },
    [entry.id],
  )

  // ---- focus mode ------------------------------------------------------------------------------

  useEffect(() => {
    setStudyChrome({ active: pageActive, focus: pageActive && focus })
  }, [pageActive, focus])
  useEffect(() => () => setStudyChrome({ active: false, focus: false }), [])

  const leaveFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    } catch {
      // Fullscreen unavailable: nothing to leave.
    }
  }

  useEffect(() => {
    if (!focus) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocus(false)
    }
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocus(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [focus])

  useEffect(() => {
    if (!focus) leaveFullscreen()
  }, [focus])
  useEffect(() => leaveFullscreen, [])

  const toggleFocus = () => {
    const next = !focus
    setFocus(next)
    if (!next) return
    try {
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    } catch {
      // No Fullscreen API: the plain full-width layout is the focus mode.
    }
  }

  // ---- prefs and runs --------------------------------------------------------------------------

  const changePrefs = (next: StudyPrefs) => {
    setPrefs(next)
    saveStudyPrefs(next)
  }

  const beginRun = (kind: StudyKind, scope: 'full' | 'subset', qids: string[], timer: TimerSetting, initial?: StudyResume) => {
    runCounter.current += 1
    setScreen({ name: 'run', runKey: runCounter.current, kind, scope, qids, timer, initial })
  }

  const handleStart = (kind: StudyKind, timer: TimerSetting) => {
    changePrefs({ ...prefs, kind, timer: { mode: timer.mode, questionSeconds: timer.questionSeconds, totalMinutes: Math.round(timer.totalSeconds / 60) } })
    const all = entry.quiz.questions.map((question) => question.id)
    if (kind === 'quick') beginRun(kind, 'subset', quickPoolIds(resultsRef.current, entry.quiz.questions), timer)
    else beginRun(kind, 'full', all, timer)
  }

  const handleResume = () => {
    const resume = resultsRef.current.resume
    if (!resume) return
    const stillThere = new Set(entry.quiz.questions.map((question) => question.id))
    const qids = resume.qids.filter((id) => stillThere.has(id))
    if (qids.length === 0) return
    beginRun(resume.kind, resume.scope, qids, resume.timer, { ...resume, qids })
  }

  const handleDiscardResume = () => {
    const { resume: _discarded, ...rest } = resultsRef.current
    void _discarded
    const next: StudyResults = rest
    store(next)
    setResults(next)
  }

  const handleSaveResume = useCallback(
    (resume: StudyResume) => {
      store({ ...resultsRef.current, resume })
    },
    [store],
  )

  const handleFinish = (summary: RunSummary, kind: StudyKind, scope: 'full' | 'subset', timer: TimerSetting) => {
    const next = withSession(resultsRef.current, summary.session, summary.qids)
    store(next)
    setResults(next)
    setScreen({ name: 'end', summary, kind, scope, timer })
  }

  const handleExit = () => {
    // Leaving an unfinished session keeps its resume point (saved after each answered question).
    onExit()
  }

  if (screen.name === 'run') {
    return (
      <StudyRun
        key={screen.runKey}
        entry={entry}
        kind={screen.kind}
        scope={screen.scope}
        qids={screen.qids}
        timer={screen.timer}
        initial={screen.initial}
        prefs={prefs}
        focus={focus}
        onToggleFocus={toggleFocus}
        onPrefsChange={changePrefs}
        onSaveResume={handleSaveResume}
        onFinish={(summary) => handleFinish(summary, screen.kind, screen.scope, screen.timer)}
        onExit={handleExit}
      />
    )
  }

  if (screen.name === 'end') {
    const { summary } = screen
    return (
      <StudyEnd
        entry={entry}
        session={summary.session}
        records={summary.records}
        results={results}
        prefs={prefs}
        onRetryWrong={() => beginRun('normal', 'subset', summary.session.wrongIds, defaultTimer('normal', summary.session.wrongIds.length))}
        onFlaggedRound={() => beginRun('normal', 'subset', summary.session.flaggedIds, defaultTimer('normal', summary.session.flaggedIds.length))}
        onAgain={() => setScreen({ name: 'start' })}
        onToArchive={onToArchive}
      />
    )
  }

  const quickCount = quickPoolIds(results, entry.quiz.questions).length
  return (
    <StudyStart
      title={entry.quiz.title}
      questionCount={entry.quiz.questions.length}
      results={results}
      quickCount={quickCount}
      prefs={prefs}
      onStart={handleStart}
      onResume={handleResume}
      onDiscardResume={handleDiscardResume}
      onExit={handleExit}
    />
  )
}
