import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getArchiveEntry, updateArchiveEntry } from '../lib/archive'
import type { ArchiveEntry } from '../lib/archive'
import type { GeneratedQuiz } from '../lib/quiz'
import QuizWorkspace from '../components/QuizWorkspace'
import SongListenSection from '../components/SongListenSection'
import { ArchiveIcon } from '../components/icons'

/** Keyed by id: opening another entry (e.g. a follow-up quiz "{title} · 2") starts with fresh state. */
export default function ArchiveQuizPage() {
  const { id } = useParams<{ id: string }>()
  return <ArchiveQuizEntry key={id} id={id} />
}

function ArchiveQuizEntry({ id }: { id: string | undefined }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [entry, setEntry] = useState<ArchiveEntry | undefined>(() => (id ? getArchiveEntry(id) : undefined))
  const [songRefreshKey, setSongRefreshKey] = useState(0)
  const [studyMode, setStudyMode] = useState(() => searchParams.get('mode') === 'study')

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
    if (updated) setEntry(updated)
  }

  const handleToggleStudyMode = () => setStudyMode((current) => !current)

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
        studyMode={studyMode}
        onToggleStudyMode={handleToggleStudyMode}
        includeExplanations={entry.includeExplanations ?? true}
        shuffleOptions={entry.shuffleOptions ?? false}
        includeHints={entry.includeHints ?? true}
        onSongSaved={() => setSongRefreshKey((key) => key + 1)}
      />
      <div data-print-hide>
        <SongListenSection key={songRefreshKey} quizId={entry.id} quizTitle={entry.quiz.title} />
      </div>
    </>
  )
}
