import { useSyncExternalStore } from 'react'

import { getAuthState } from './auth/authStore'
import { DEFAULT_QUESTION_SECONDS } from './study'
import type { StudyKind, TimerSetting } from './study'

/** The student's last study choices, remembered per signed-in user on this device (a convenience,
 * never account data). */

export interface StudyPrefs {
  kind: StudyKind
  timer: Pick<TimerSetting, 'mode' | 'questionSeconds'> & { totalMinutes?: number }
  /** Streak pulse and the confetti burst; off for people who find them distracting. */
  celebrate: boolean
}

const STORAGE_KEY = 'quelio.studyPrefs.v1'

export const DEFAULT_PREFS: StudyPrefs = { kind: 'normal', timer: { mode: 'off', questionSeconds: DEFAULT_QUESTION_SECONDS }, celebrate: true }

type Store = Record<string, StudyPrefs>

function readStore(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

const userKey = () => getAuthState().user?.id ?? 'anonymous'

export function loadStudyPrefs(): StudyPrefs {
  const saved = readStore()[userKey()]
  if (!saved) return DEFAULT_PREFS
  return {
    kind: saved.kind === 'exam' || saved.kind === 'quick' ? saved.kind : 'normal',
    timer: {
      mode: saved.timer?.mode === 'total' || saved.timer?.mode === 'question' ? saved.timer.mode : 'off',
      questionSeconds: Math.min(3600, Math.max(5, Number(saved.timer?.questionSeconds) || DEFAULT_QUESTION_SECONDS)),
      ...(saved.timer?.totalMinutes ? { totalMinutes: Math.min(600, Math.max(1, Number(saved.timer.totalMinutes))) } : {}),
    },
    celebrate: saved.celebrate !== false,
  }
}

export function saveStudyPrefs(prefs: StudyPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStore(), [userKey()]: prefs }))
  } catch {
    // Storage unavailable: the choice just is not remembered.
  }
}

// ---------------------------------------------------------------------------
// Focus layout: the study screen asks the app shell to hide the sidebar and header.
// ---------------------------------------------------------------------------

interface StudyChrome {
  active: boolean
  focus: boolean
}

let chrome: StudyChrome = { active: false, focus: false }
const listeners = new Set<() => void>()

export function setStudyChrome(patch: Partial<StudyChrome>): void {
  const next = { ...chrome, ...patch }
  if (next.active === chrome.active && next.focus === chrome.focus) return
  chrome = next
  listeners.forEach((listener) => listener())
}

export function useStudyChrome(): StudyChrome {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => chrome,
  )
}
