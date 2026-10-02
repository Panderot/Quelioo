import { isRecord } from '../lib/lesson'
import type {
  EpisodePlan,
  KeyPoint,
  LessonCheckResponse,
  LessonErrorCode,
  LessonOptions,
  LessonPlanResponse,
  LessonScriptResponse,
  ScriptSection,
} from '../lib/lesson'
import { clearStoredOwnerAccessCode, getStoredOwnerAccessCode, setStoredOwnerAccessCode } from '../lib/ownerAccessCode'

export type LessonClientErrorCode = LessonErrorCode | 'network'

const ERROR_CODES: ReadonlySet<string> = new Set([
  'bad_type',
  'too_large',
  'too_short',
  'too_long',
  'upstream',
  'parse',
  'model',
  'not_configured',
  'rate_limited',
  'locked',
  'timeout',
])

export class LessonApiError extends Error {
  code: LessonClientErrorCode

  constructor(code: LessonClientErrorCode) {
    super(code)
    this.code = code
  }
}

let statusPromise: Promise<{ requiresAccessCode: boolean }> | null = null

/** Whether creating lessons needs the owner code (production). Fetched once per page load. */
export function getLessonStatus(): Promise<{ requiresAccessCode: boolean }> {
  if (!statusPromise) {
    statusPromise = fetch('/api/lesson')
      .then((response) => response.json())
      .then((json: unknown) => ({ requiresAccessCode: isRecord(json) && json.requiresAccessCode === true }))
      // Unknown status: assume the gate is on; the server stays the real gate either way.
      .catch(() => ({ requiresAccessCode: true }))
  }
  return statusPromise
}

async function postLesson(body: Record<string, unknown>, signal?: AbortSignal, code?: string): Promise<unknown> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const accessCode = code ?? getStoredOwnerAccessCode()
  if (accessCode) headers['x-owner-access'] = accessCode
  let response: Response
  try {
    response = await fetch('/api/lesson', { method: 'POST', headers, body: JSON.stringify(body), signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new LessonApiError('network')
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new LessonApiError(response.status === 504 ? 'timeout' : 'parse')
  }
  if (isRecord(json) && typeof json.error === 'string') {
    throw new LessonApiError(ERROR_CODES.has(json.error) ? (json.error as LessonErrorCode) : 'upstream')
  }
  return json
}

/** Checks a candidate owner code with the zero-cost "unlock" action; stores it when accepted. */
export async function verifyAndStoreLessonAccessCode(code: string): Promise<boolean> {
  try {
    await postLesson({ action: 'unlock' }, undefined, code)
    setStoredOwnerAccessCode(code)
    return true
  } catch (error) {
    if (error instanceof LessonApiError && error.code === 'locked') clearStoredOwnerAccessCode()
    return false
  }
}

function isPlan(value: unknown): value is LessonPlanResponse {
  return isRecord(value) && Array.isArray(value.keyPoints) && Array.isArray(value.episodes) && isRecord(value.usage)
}

function isScript(value: unknown): value is LessonScriptResponse {
  return isRecord(value) && isRecord(value.episode) && Array.isArray(value.episode.sections) && isRecord(value.usage)
}

function isCheck(value: unknown): value is LessonCheckResponse {
  return isRecord(value) && Array.isArray(value.sections) && isRecord(value.check) && isRecord(value.usage)
}

export async function planLesson(payload: { text: string; level: LessonOptions['level']; language: string }, signal?: AbortSignal): Promise<LessonPlanResponse> {
  const json = await postLesson({ action: 'plan', ...payload }, signal)
  if (!isPlan(json)) throw new LessonApiError('parse')
  return json
}

export async function writeLessonEpisode(
  payload: { text: string; keyPoints: KeyPoint[]; episodes: EpisodePlan[]; part: number } & LessonOptions,
  signal?: AbortSignal,
): Promise<LessonScriptResponse> {
  const json = await postLesson({ action: 'script', ...payload }, signal)
  if (!isScript(json)) throw new LessonApiError('parse')
  return json
}

export async function checkLessonEpisode(
  payload: { text: string; keyPoints: KeyPoint[]; part: number; sections: ScriptSection[]; lineIds: string[] } & LessonOptions,
  signal?: AbortSignal,
): Promise<LessonCheckResponse> {
  const json = await postLesson({ action: 'check', ...payload }, signal)
  if (!isCheck(json)) throw new LessonApiError('parse')
  return json
}
