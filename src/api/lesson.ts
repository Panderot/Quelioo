import { isRecord } from '../lib/lesson'
import type {
  DeliveryHint,
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
  'daily_cap',
  'budget',
])

export class LessonApiError extends Error {
  code: LessonClientErrorCode

  constructor(code: LessonClientErrorCode) {
    super(code)
    this.code = code
  }
}

export interface LessonStatus {
  requiresAccessCode: boolean
  /** LESSON_MONTHLY_BUDGET_USD when set. */
  monthlyBudgetUsd: number | null
}

let statusPromise: Promise<LessonStatus> | null = null

/** Whether creating lessons needs the owner code (production) and the optional monthly budget. Fetched once per page load. */
export function getLessonStatus(): Promise<LessonStatus> {
  if (!statusPromise) {
    statusPromise = fetch('/api/lesson')
      .then((response) => response.json())
      .then((json: unknown) => ({
        requiresAccessCode: isRecord(json) && json.requiresAccessCode === true,
        monthlyBudgetUsd: isRecord(json) && typeof json.monthlyBudgetUsd === 'number' ? json.monthlyBudgetUsd : null,
      }))
      // Unknown status: assume the gate is on; the server stays the real gate either way.
      .catch(() => ({ requiresAccessCode: true, monthlyBudgetUsd: null }))
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

export interface SpokenSegment {
  id: string
  audio: Uint8Array
  durationSeconds: number
}

export interface SpeakResult {
  segments: SpokenSegment[]
  failed: string[]
  unknownAbbreviations: string[]
  costUsd: number
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Records one small batch of lines (one MP3 segment per line). */
export async function speakLessonLines(
  payload: { lessonKey: string; style: LessonOptions['style']; language: string; voices: Record<string, string>; lines: { id: string; speaker: string; text: string; delivery?: DeliveryHint }[] },
  signal?: AbortSignal,
): Promise<SpeakResult> {
  const json = await postLesson({ action: 'speak', ...payload }, signal)
  if (!isRecord(json) || !Array.isArray(json.segments) || !isRecord(json.usage)) throw new LessonApiError('parse')
  const segments = json.segments.filter(isRecord).flatMap((segment) =>
    typeof segment.id === 'string' && typeof segment.audio === 'string' && typeof segment.durationSeconds === 'number'
      ? [{ id: segment.id, audio: base64ToBytes(segment.audio), durationSeconds: segment.durationSeconds }]
      : [],
  )
  return {
    segments,
    failed: Array.isArray(json.failed) ? json.failed.filter((id): id is string => typeof id === 'string') : [],
    unknownAbbreviations: Array.isArray(json.unknownAbbreviations) ? json.unknownAbbreviations.filter((token): token is string => typeof token === 'string') : [],
    costUsd: typeof json.usage.costUsd === 'number' ? json.usage.costUsd : 0,
  }
}
