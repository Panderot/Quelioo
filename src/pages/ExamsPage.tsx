import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LoadError, SkeletonList } from '../components/DataStates'
import { ExamIcon } from '../components/icons'
import ConfirmDialog from '../components/live/ConfirmDialog'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useOnPageReturn } from '../hooks/usePageActive'
import { getAuthState } from '../lib/auth/authStore'
import { newExamId } from '../lib/exam/factory'
import { purgeStaleDrafts } from '../lib/exam/drafts'
import { deleteExam, duplicateExam, listExams, renameExam } from '../lib/exam/store'
import type { ExamListItem } from '../lib/exam/store'

function formatWhen(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/** /exams: a short explanation, "New written exam" and the teacher's own exams (open, rename, duplicate, delete). */
export default function ExamsPage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('exam.list.title'))
  const navigate = useNavigate()
  const [items, setItems] = useState<ExamListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<ExamListItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionFailed, setActionFailed] = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)

  const [version, setVersion] = useState(0)
  const load = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    listExams()
      .then((list) => {
        if (cancelled) return
        if (list === null) {
          setFailed(true)
        } else {
          setItems(list)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  useEffect(() => {
    const userId = getAuthState().user?.id
    if (userId) purgeStaleDrafts(userId, Date.now())
  }, [])
  useOnPageReturn(load)
  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming])

  const startNew = () => navigate(`/exams/new?d=${newExamId()}`)

  const commitRename = async () => {
    const id = renaming
    const title = renameValue.trim()
    setRenaming(null)
    if (!id || !title) return
    setActionFailed(false)
    try {
      if ((await renameExam(id, title.slice(0, 200))).status !== 'ok') setActionFailed(true)
    } catch {
      setActionFailed(true)
    }
    load()
  }

  const duplicate = async (item: ExamListItem) => {
    if (busy) return
    setBusy(true)
    setActionFailed(false)
    try {
      if (!(await duplicateExam(item.id, t('exam.list.copySuffix')))) setActionFailed(true)
    } catch {
      setActionFailed(true)
    }
    setBusy(false)
    load()
  }

  const confirmDelete = async () => {
    if (!deleting || busy) return
    setBusy(true)
    setActionFailed(false)
    try {
      if (!(await deleteExam(deleting.id))) setActionFailed(true)
    } catch {
      setActionFailed(true)
    }
    setBusy(false)
    setDeleting(null)
    load()
  }

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold text-navy">
          <ExamIcon className="h-7 w-7 text-amber-text" />
          {t('exam.list.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted">{t('exam.list.intro')}</p>
        <div className="pt-2">
          <button
            type="button"
            data-purpose="exam-new"
            onClick={startNew}
            className="min-h-11 rounded-xl bg-amber px-5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover"
          >
            {t('exam.list.new')}
          </button>
        </div>
      </section>

      <section data-purpose="exam-list" className="space-y-3">
        <h2 className="text-sm font-bold text-ink">{t('exam.list.mine')}</h2>
        {actionFailed && (
          <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-3 text-sm font-semibold text-error">
            {t('exam.list.actionFailed')}
          </p>
        )}
        {failed ? (
          <LoadError onRetry={load} />
        ) : items === null ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <p data-purpose="exam-empty" className="rounded-[14px] border border-dashed border-warm-border p-6 text-center text-sm text-muted">
            {t('exam.list.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
            {items.map((item) => (
              <li key={item.id} data-purpose="exam-item" className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
                <div className="min-w-0 flex-1 space-y-1">
                  {renaming === item.id ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      aria-label={t('exam.list.renameLabel')}
                      maxLength={200}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitRename()
                        if (event.key === 'Escape') setRenaming(null)
                      }}
                      className="h-10 w-full rounded-lg border border-warm-border bg-card px-3 text-sm font-semibold text-ink"
                    />
                  ) : (
                    <Link to={`/exams/${item.id}`} data-purpose="exam-open" className="block truncate text-sm font-semibold text-ink hover:text-amber-text">
                      {item.title}
                    </Link>
                  )}
                  <p className="truncate text-xs text-muted">
                    {[item.course, item.grade ? t('exam.list.grade', { grade: item.grade }) : '', formatWhen(item.updatedAt, i18n.language), t('exam.list.questions', { count: item.questionCount })]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link to={`/exams/${item.id}`} className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:border-amber">
                    {t('exam.list.open')}
                  </Link>
                  <button
                    type="button"
                    data-purpose="exam-rename"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setRenameValue(item.title)
                      setRenaming(item.id)
                    }}
                    className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:border-amber"
                  >
                    {t('exam.list.rename')}
                  </button>
                  <button
                    type="button"
                    data-purpose="exam-duplicate"
                    disabled={busy}
                    onClick={() => void duplicate(item)}
                    className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:border-amber disabled:opacity-60"
                  >
                    {t('exam.list.duplicate')}
                  </button>
                  <button
                    type="button"
                    data-purpose="exam-delete"
                    onClick={() => setDeleting(item)}
                    className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:border-error"
                  >
                    {t('exam.list.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title={t('exam.list.deleteTitle', { title: deleting.title })}
          body={t('exam.list.deleteBody')}
          confirmLabel={t('exam.list.deleteYes')}
          cancelLabel={t('exam.list.deleteNo')}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </>
  )
}
