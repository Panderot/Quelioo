import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getArchiveEntry, setArchiveEntryStudyMode, updateArchiveEntry } from '../lib/archive'
import type { ArchiveEntry } from '../lib/archive'
import type { GeneratedQuiz } from '../lib/quiz'
import QuizWorkspace from '../components/QuizWorkspace'
import { ArchiveIcon } from '../components/icons'

export default function ArchiveQuizPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<ArchiveEntry | undefined>(() => (id ? getArchiveEntry(id) : undefined))

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

  if (!entry.quiz) {
    return (
      <div
        data-purpose="archive-quiz-legacy"
        className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center"
      >
        <ArchiveIcon className="h-8 w-8 text-muted" />
        <div>
          <p className="text-sm font-semibold text-ink">{entry.title}</p>
          <p className="mt-1 text-xs text-muted">{t('archive.detail.legacyBody')}</p>
        </div>
        <Link
          to="/"
          className="mt-1 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
        >
          {t('archive.empty.cta')}
        </Link>
      </div>
    )
  }

  const handlePersist = (quiz: GeneratedQuiz) => {
    const updated = updateArchiveEntry(entry.id, (current) => ({ ...current, title: quiz.title, quiz }))
    if (updated) setEntry(updated)
  }

  const handleToggleStudyMode = () => {
    const next = !entry.studyMode
    setArchiveEntryStudyMode(entry.id, next)
    setEntry((current) => (current ? { ...current, studyMode: next } : current))
  }

  return (
    <QuizWorkspace
      key={entry.id}
      initialQuiz={entry.quiz}
      demo={entry.demo ?? false}
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
      uiLanguage={i18n.language}
      requestedCount={entry.quiz.questions.length}
      incomplete={false}
      onPersist={handlePersist}
      archiveLink={{ href: '/archive', label: t('archive.detail.backToArchive') }}
      studyMode={entry.studyMode}
      onToggleStudyMode={handleToggleStudyMode}
    />
  )
}
