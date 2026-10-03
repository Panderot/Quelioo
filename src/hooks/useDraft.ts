import { useEffect, useRef } from 'react'

import type { FocusPart } from '../lib/focusSnippets'
import type { InputTab } from '../components/InputCard'
import { MAX_SOURCE_TEXT_CHARS } from '../lib/textStats'

const DRAFT_STORAGE_KEY = 'quelio.draft.v1'
const SAVE_DEBOUNCE_MS = 500

export interface QuizDraft {
  textValue: string
  activeTab: InputTab
  urlValue: string
  outputLanguage: string
  title: string
  questionType: string
  questionCount: string
  difficulty: string
  optionsCount: string
  includeExplanations: boolean
  shuffleOptions: boolean
  includeHints: boolean
  focusParts: FocusPart[]
}

function isInputTab(value: unknown): value is InputTab {
  return value === 'text' || value === 'file' || value === 'url'
}

function isFocusPart(value: unknown): value is FocusPart {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FocusPart).id === 'string' &&
    typeof (value as FocusPart).start === 'number' &&
    typeof (value as FocusPart).end === 'number'
  )
}

/** Reads and loosely validates a saved draft — returns null for anything malformed rather than
 * throwing, since localStorage content can't be trusted (another tab, a stale schema version). */
export function readDraft(): QuizDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const draft = parsed as Partial<QuizDraft>
    if (typeof draft.textValue !== 'string') return null
    return {
      textValue: draft.textValue,
      activeTab: isInputTab(draft.activeTab) ? draft.activeTab : 'text',
      urlValue: typeof draft.urlValue === 'string' ? draft.urlValue : '',
      outputLanguage: typeof draft.outputLanguage === 'string' ? draft.outputLanguage : 'auto',
      title: typeof draft.title === 'string' ? draft.title : '',
      questionType: typeof draft.questionType === 'string' ? draft.questionType : 'mcq',
      questionCount: typeof draft.questionCount === 'string' ? draft.questionCount : 'auto',
      difficulty: typeof draft.difficulty === 'string' ? draft.difficulty : 'medium',
      optionsCount: typeof draft.optionsCount === 'string' ? draft.optionsCount : '4',
      includeExplanations: typeof draft.includeExplanations === 'boolean' ? draft.includeExplanations : true,
      shuffleOptions: typeof draft.shuffleOptions === 'boolean' ? draft.shuffleOptions : true,
      includeHints: typeof draft.includeHints === 'boolean' ? draft.includeHints : true,
      focusParts: Array.isArray(draft.focusParts) ? draft.focusParts.filter(isFocusPart) : [],
    }
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // localStorage unavailable — nothing to clear.
  }
}

/** Debounced autosave — caps the stored text at the app's own source-text limit and never throws
 * (private browsing, full storage, etc. simply mean the draft isn't saved). */
export function useSaveDraft(draft: QuizDraft, enabled: boolean): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      try {
        const capped: QuizDraft = { ...draft, textValue: draft.textValue.slice(0, MAX_SOURCE_TEXT_CHARS) }
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(capped))
      } catch {
        // storage unavailable or full — the page still works, it just won't persist a draft.
      }
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `draft` is a fresh object every render; JSON below is the real dependency
  }, [JSON.stringify(draft), enabled])
}
