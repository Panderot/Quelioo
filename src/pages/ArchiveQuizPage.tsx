import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LoadError, SkeletonList } from '../components/DataStates'
import { getArchiveEntry, updateArchiveEntry, useArchive } from '../lib/archive'
import type { ArchiveEntry } from '../lib/archive'
import type { GeneratedQuiz } from '../lib/quiz'
import QuizWorkspace from '../components/QuizWorkspace'
import SongListenSection from '../components/SongListenSection'
import StudyHistory from '../components/study/StudyHistory'
import StudyView from '../components/study/StudyView'
import { ArchiveIcon } from '../components/icons'
import { useOnPageReturn } from '../hooks/usePageActive'

/** Keyed by id: opening another entry (e.g. a follow-up quiz "{title} · 2") starts with fresh state. */
export default function ArchiveQuizPage() {
  const { id } = useParams<{ id: string }>()
  return <ArchiveQuizEntry key={id} id={id} />
}

function ArchiveQuizEntry({ id }: { id: string | undefined }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const archive = useArchive()
  // Read from the store on every render: a deep link or a reload opens this page before the account's
  // quizzes have loaded, and a quiz deleted elsewhere simply stops being found. The version bump
  // re-reads after a save in the browser-local (test) build, which has no change notifications.
  const [, setVersion] = useState(0)
  const entry: ArchiveEntry | undefined = id ? getArchiveEntry(id) : undefined
  const [songRefreshKey, setSongRefreshKey] = useState(0)
  // Kept mounted while the user is elsewhere: the quiz may have been deleted, or got a new song.
  useOnPageReturn(() => {
    setVersion((value) => value + 1)
    setSongRefreshKey((key) => key + 1)
  })
  // Study mode lives in the URL: this page stays mounted, so a later visit to ?mode=study must not depend on
  // initial state. Every visit is a new history entry (new location key), which starts the study screen afresh.
  const studyMode = searchParams.get('mode') === 'study'

  if (!entry && !archive.loaded) return archive.failed ? <LoadError onRetry={archive.reload} /> : <SkeletonList />

  if (!entry) {
    return (
      <div
        data-purpose="archive-quiz-not-found"
        className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center"
      >
        <ArchiveIcon className="h-8 w-8 text-muted" />
        <div>
          <p className="text-sm font-semibold text-ink">{t('archive.detail.notFoundTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('archive.detail.notFoundBody')}</p>
        </div>
        <Link
          to="/archive"
          className="mt-1 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
        >
          {t('archive.detail.backToArchive')}
        </Link>
      </div>
    )
  }

  const handlePersist = (quiz: GeneratedQuiz) => {
    const updated = updateArchiveEntry(entry.id, (current) => ({ ...current, title: quiz.title, quiz }))
    if (updated) setVersion((value) => value + 1)
  }

  // Back to where the student came from (Archive, or this quiz's page); a deep link has nothing to go back to.
  const handleExitStudy = () => {
    if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) navigate(-1)
    else navigate(`/archive/${entry.id}`, { replace: true })
  }

  if (studyMode) return <StudyView key={location.key} entry={entry} onExit={handleExitStudy} onToArchive={() => navigate('/archive')} />

  return (
    <>
      <QuizWorkspace
        key={entry.id}
        quizId={entry.id}
        initialQuiz={entry.quiz}
        sourceText={entry.sourceText ?? ''}
        meta={{
          questionCount: entry.quiz.questions.length,
          questionType: entry.questionType,
          difficulty: entry.difficulty,
          outputLanguage: entry.outputLanguage ?? 'auto',
        }}
        difficulty={entry.difficulty}
        optionsCount={entry.optionsCount ?? undefined}
        outputLanguage={entry.outputLanguage ?? 'auto'}
        requestedCount={entry.quiz.questions.length}
        incomplete={false}
        onPersist={handlePersist}
        archiveLink={{ href: '/archive', label: t('archive.detail.backToArchive') }}
        includeExplanations={entry.includeExplanations ?? true}
        shuffleOptions={entry.shuffleOptions ?? false}
        includeHints={entry.includeHints ?? true}
        onSongSaved={() => setSongRefreshKey((key) => key + 1)}
      />
      <div data-print-hide className="space-y-7">
        <StudyHistory entry={entry} />
        <SongListenSection key={songRefreshKey} quizId={entry.id} quizTitle={entry.quiz.title} />
      </div>
    </>
  )
}
