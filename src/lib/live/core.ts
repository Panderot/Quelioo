import type { QuizQuestion } from '../quiz.js'

/** Shared by the browser (board, phones, tests) and api/live: game rules, scoring, nicknames and the
 * shapes sent over the wire. Pure functions only, so the server's decisions are unit-testable. */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LIVE_TIME_OPTIONS = [10, 20, 30, 60] as const
export const LIVE_DEFAULT_SECONDS = 20
export const LIVE_DEFAULT_MAX_PLAYERS = 60
export const LIVE_MAX_PLAYERS = 100
/** A signed-in teacher can host this many unfinished games at once. */
export const LIVE_MAX_ACTIVE_GAMES = 3
/** A game with no teacher activity for this long ends by itself. */
export const LIVE_IDLE_MINUTES = 30
/** Players and answers of a finished game are deleted after this many days. */
export const LIVE_PURGE_DAYS = 30
/** Network allowance: an answer that reaches the server this long after the deadline still counts. */
export const LIVE_ANSWER_GRACE_MS = 400
export const LIVE_JOIN_ATTEMPTS_PER_MINUTE = 20
export const LIVE_NICKNAME_MIN = 2
export const LIVE_NICKNAME_MAX = 16
export const LIVE_CODE_LENGTH = 6
export const LIVE_MAX_QUESTIONS = 200

export const POINTS_MAX = 1000
export const POINTS_MIN_CORRECT = 500
export const STREAK_BONUS_STEP = 100
export const STREAK_BONUS_CAP = 500

export type LiveGameStateName = 'lobby' | 'question' | 'reveal' | 'finished' | 'ended'
export const ACTIVE_STATES: readonly LiveGameStateName[] = ['lobby', 'question', 'reveal']

export function isActiveState(state: string): boolean {
  return (ACTIVE_STATES as readonly string[]).includes(state)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface LiveSettings {
  secondsPerQuestion: number
  showLeaderboard: boolean
  shuffleQuestions: boolean
  sound: boolean
  maxPlayers: number
  /** Students may join after the game started (not during the last question). */
  lateJoin: boolean
}

export const LIVE_DEFAULT_SETTINGS: LiveSettings = {
  secondsPerQuestion: LIVE_DEFAULT_SECONDS,
  showLeaderboard: true,
  shuffleQuestions: false,
  sound: true,
  maxPlayers: LIVE_DEFAULT_MAX_PLAYERS,
  lateJoin: true,
}

/** Clamps whatever the browser sent to the values the game allows. */
export function sanitizeSettings(raw: unknown): LiveSettings {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const seconds = Number(input.secondsPerQuestion)
  const max = Math.round(Number(input.maxPlayers))
  return {
    secondsPerQuestion: (LIVE_TIME_OPTIONS as readonly number[]).includes(seconds) ? seconds : LIVE_DEFAULT_SECONDS,
    showLeaderboard: input.showLeaderboard !== false,
    shuffleQuestions: input.shuffleQuestions === true,
    sound: input.sound !== false,
    maxPlayers: Number.isFinite(max) ? Math.min(LIVE_MAX_PLAYERS, Math.max(1, max)) : LIVE_DEFAULT_MAX_PLAYERS,
    lateJoin: input.lateJoin !== false,
  }
}

// ---------------------------------------------------------------------------
// Questions: which quiz questions can be played live
// ---------------------------------------------------------------------------

export type LiveKind = 'single' | 'multi' | 'truefalse'

/** What the server keeps for a running game (correct answers included; never sent to students before the reveal). */
export interface LiveQuestionSnapshot {
  id: string
  kind: LiveKind
  text: string
  /** Empty for true/false: the board and phones show the localised "True" / "False" (option 0 / option 1). */
  options: string[]
  correct: number[]
  explanation: string
}

/** What students and the board see while a question is open. */
export interface LivePublicQuestion {
  index: number
  total: number
  kind: LiveKind
  text: string
  options: string[]
  limitSeconds: number
}

export interface LiveSkippedQuestion {
  index: number
  id: string
  text: string
  /** Quiz question type (fill-blanks, short-answer, matching, open-ended, mcq with too many options...). */
  type: string
}

export interface LiveQuestionPlan {
  questions: LiveQuestionSnapshot[]
  skipped: LiveSkippedQuestion[]
}

const MIN_OPTIONS = 2
const MAX_OPTIONS = 5

function validIndices(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const unique = [...new Set(value)]
  if (unique.length !== value.length || unique.length >= length) return null
  return unique.every((entry) => Number.isInteger(entry) && entry >= 0 && entry < length) ? (unique as number[]).sort((a, b) => a - b) : null
}

/** Sorts a quiz's questions into "can be played live" (multiple choice with 2 to 5 options, multi-answer
 * multiple choice, true/false) and "skipped" (everything else), keeping the stored option order. */
export function planLiveQuestions(questions: readonly QuizQuestion[]): LiveQuestionPlan {
  const plan: LiveQuestionPlan = { questions: [], skipped: [] }
  questions.forEach((question, index) => {
    const skip = () => plan.skipped.push({ index, id: question.id, text: question.question, type: question.type })
    if (question.type === 'true-false') {
      plan.questions.push({ id: question.id, kind: 'truefalse', text: question.question, options: [], correct: [question.answerBool ? 0 : 1], explanation: question.explanation })
      return
    }
    if (question.type === 'mcq') {
      const length = question.options.length
      if (length < MIN_OPTIONS || length > MAX_OPTIONS) return skip()
      const multi = validIndices((question as { answerIndices?: unknown }).answerIndices, length)
      if (multi) {
        plan.questions.push({ id: question.id, kind: 'multi', text: question.question, options: [...question.options], correct: multi, explanation: question.explanation })
        return
      }
      if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex >= length) return skip()
      plan.questions.push({ id: question.id, kind: 'single', text: question.question, options: [...question.options], correct: [question.answerIndex], explanation: question.explanation })
      return
    }
    skip()
  })
  return plan
}

/** Number of options a question shows (true/false always has two). */
export function optionCount(question: Pick<LiveQuestionSnapshot, 'kind' | 'options'>): number {
  return question.kind === 'truefalse' ? 2 : question.options.length
}

export function toPublicQuestion(question: LiveQuestionSnapshot, index: number, total: number, limitSeconds: number): LivePublicQuestion {
  return { index, total, kind: question.kind, text: question.text, options: question.options, limitSeconds }
}

/** A student's answer as a clean, sorted, duplicate-free list of valid option numbers, or null if it is not a valid answer. */
export function parseAnswer(raw: unknown, question: Pick<LiveQuestionSnapshot, 'kind' | 'options'>): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPTIONS) return null
  const count = optionCount(question)
  if (!raw.every((entry) => Number.isInteger(entry) && entry >= 0 && entry < count)) return null
  const unique = [...new Set(raw as number[])].sort((a, b) => a - b)
  if (unique.length !== raw.length) return null
  if (question.kind !== 'multi' && unique.length !== 1) return null
  return unique
}

/** Exactly the right set of options (multi-answer has no partial credit). */
export function isCorrectAnswer(answer: readonly number[], correct: readonly number[]): boolean {
  if (answer.length !== correct.length) return false
  const sorted = [...answer].sort((a, b) => a - b)
  const target = [...correct].sort((a, b) => a - b)
  return sorted.every((entry, i) => entry === target[i])
}

// ---------------------------------------------------------------------------
// Scoring (computed on the server only)
// ---------------------------------------------------------------------------

/** 1000 points for an instant answer, falling linearly to 500 at the last moment. */
export function basePoints(elapsedMs: number, limitMs: number): number {
  if (limitMs <= 0) return POINTS_MIN_CORRECT
  const ratio = Math.min(1, Math.max(0, elapsedMs / limitMs))
  return Math.round(POINTS_MAX - (POINTS_MAX - POINTS_MIN_CORRECT) * ratio)
}

/** +100 for every consecutive correct answer from the second one, at most +500. `streakAfter` includes the current answer. */
export function streakBonus(streakAfter: number): number {
  return streakAfter >= 2 ? Math.min(STREAK_BONUS_CAP, STREAK_BONUS_STEP * (streakAfter - 1)) : 0
}

export interface ScoredAnswer {
  questionIndex: number
  correct: boolean
  elapsedMs: number
}

export interface QuestionOutcome {
  questionIndex: number
  correct: boolean
  points: number
  base: number
  bonus: number
  streak: number
}

export interface PlayerTotals {
  score: number
  streak: number
  correctCount: number
  totalTimeMs: number
  outcomes: QuestionOutcome[]
}

/** Replays a player's answers question by question: points, streak (a skipped/unanswered/wrong question resets it)
 * and total answer time (the tie-break). `playedIndices` are the questions that were revealed, in order. */
export function scorePlayer(answers: readonly ScoredAnswer[], playedIndices: readonly number[], limitMs: number): PlayerTotals {
  const byQuestion = new Map(answers.map((answer) => [answer.questionIndex, answer]))
  const totals: PlayerTotals = { score: 0, streak: 0, correctCount: 0, totalTimeMs: 0, outcomes: [] }
  for (const index of playedIndices) {
    const answer = byQuestion.get(index)
    if (!answer) {
      totals.streak = 0
      totals.outcomes.push({ questionIndex: index, correct: false, points: 0, base: 0, bonus: 0, streak: 0 })
      continue
    }
    totals.totalTimeMs += Math.min(limitMs, Math.max(0, answer.elapsedMs))
    if (!answer.correct) {
      totals.streak = 0
      totals.outcomes.push({ questionIndex: index, correct: false, points: 0, base: 0, bonus: 0, streak: 0 })
      continue
    }
    totals.streak += 1
    totals.correctCount += 1
    const base = basePoints(answer.elapsedMs, limitMs)
    const bonus = streakBonus(totals.streak)
    totals.score += base + bonus
    totals.outcomes.push({ questionIndex: index, correct: true, points: base + bonus, base, bonus, streak: totals.streak })
  }
  return totals
}

export interface Rankable {
  id: string
  nickname: string
  score: number
  totalTimeMs: number
}

/** Highest score first; equal scores go to whoever answered faster overall; equal in both share a rank. */
export function rankPlayers<T extends Rankable>(players: readonly T[]): (T & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs || a.nickname.localeCompare(b.nickname) || a.id.localeCompare(b.id))
  let rank = 0
  return sorted.map((player, i) => {
    const previous = sorted[i - 1]
    if (!previous || previous.score !== player.score || previous.totalTimeMs !== player.totalTimeMs) rank = i + 1
    return { ...player, rank }
  })
}

// ---------------------------------------------------------------------------
// Codes and tokens
// ---------------------------------------------------------------------------

export function normalizeCodeInput(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const digits = String(raw).replace(/[\s-]/g, '')
  return /^[0-9]{6}$/.test(digits) ? digits : null
}

export function formatCode(code: string): string {
  return code.length === LIVE_CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

// ---------------------------------------------------------------------------
// Nicknames
// ---------------------------------------------------------------------------

export type NicknameProblem = 'too_short' | 'too_long' | 'invalid_chars' | 'blocked' | 'reserved'

const TURKISH_FOLD: Record<string, string> = { ı: 'i', İ: 'i', ß: 'ss' }
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' }

/** Lower-case, accent-free, look-alike-free form used to compare nicknames and to run the word filter. */
function foldLetters(input: string, leet: boolean): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ıİß]/g, (char) => TURKISH_FOLD[char] ?? char)
    .toLowerCase()
  const mapped = leet ? base.replace(/[0134578@$!]/g, (char) => LEET[char] ?? char) : base
  return mapped.replace(/[^\p{L}\p{N}]/gu, '')
}

const collapseRepeats = (value: string) => value.replace(/(.)\1+/gu, '$1')

/** Key that makes "Ali", "ali" and "Alı" the same nickname. */
export function nicknameKey(nickname: string): string {
  return foldLetters(nickname, false).slice(0, 64) || nickname.toLowerCase().slice(0, 64)
}

/** Cleans what the student typed: Unicode-normalised, trimmed, inner whitespace collapsed. */
export function cleanNickname(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

// Words that cannot be a nickname. Long entries are matched inside the nickname; short ones only as a whole word
// (so "Aqua" or "Assistant" is fine). Matching ignores case, accents, repeated letters and look-alike digits.
const BLOCKED_LONG = [
  // Turkish
  'siktir', 'sikik', 'sikeyim', 'sikim', 'sikis', 'orospu', 'oruspu', 'pezevenk', 'yarrak', 'yarak', 'gavat', 'kahpe', 'ibne', 'amcik', 'aminakoy', 'aminakod', 'kaltak', 'surtuk', 'serefsiz', 'gerizekali', 'dangalak',
  'yavsak', 'pust', 'tasak', 'anani', 'bokun', 'bokum', 'boktan', 'hassiktir', 'ananisikeyim', 'gotun', 'gotveren', 'mastirbasyon',
  // English
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'pussy', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'rapist', 'nazi', 'hitler', 'porn', 'penis', 'vagina', 'retard', 'blowjob', 'dildo', 'wanker',
]
const BLOCKED_WORD_ONLY = ['amk', 'aq', 'sik', 'oc', 'pic', 'got', 'mal', 'dick', 'cock', 'cum', 'tits', 'sex', 'rape', 'kys', 'fag', 'ass', 'damn', 'hoe', 'anus', 'gay']
// Short or common words are only blocked when they stand alone.
// A short word matches as typed; a stretched spelling ("amkkk") only counts for words without a double letter (so "45" -> "as" is not "ass").
const WORD_EXACT = new Set(BLOCKED_WORD_ONLY)
const WORD_STRETCHABLE = new Set(BLOCKED_WORD_ONLY.filter((word) => collapseRepeats(word) === word))
const blockedWord = (folded: string) => WORD_EXACT.has(folded) || WORD_STRETCHABLE.has(collapseRepeats(folded))
const LONG_SET = BLOCKED_LONG.filter((word) => word.length >= 4).map((word) => collapseRepeats(word))

const RESERVED = ['ogretmen', 'ogretmenim', 'ogretmenimiz', 'hoca', 'hocam', 'teacher', 'admin', 'administrator', 'moderator', 'mod', 'host', 'system', 'sistem', 'quelio', 'support', 'staff', 'okul', 'mudur', 'muduru', 'principal']

/** Why a nickname is refused, or null when it is fine. `raw` is what was typed. */
export function nicknameProblem(raw: unknown): NicknameProblem | null {
  const nickname = cleanNickname(raw)
  const length = [...nickname].length
  if (length < LIVE_NICKNAME_MIN) return 'too_short'
  if (length > LIVE_NICKNAME_MAX) return 'too_long'
  // Letters, digits, spaces, a few separators and emoji; no control characters, links or markup.
  if (!/^[\p{L}\p{N}\p{M}\p{Extended_Pictographic} ._\-']+$/u.test(nickname.replace(/\u200d|\ufe0f/gu, ''))) return 'invalid_chars'

  const folded = collapseRepeats(foldLetters(nickname, true))
  const plain = collapseRepeats(foldLetters(nickname, false))
  const words = nickname.split(' ').map((word) => foldLetters(word, true))

  for (const candidate of [folded, plain]) {
    if (RESERVED.some((word) => candidate === word || (word.length >= 5 && candidate.includes(word)))) return 'reserved'
    if (LONG_SET.some((word) => candidate.includes(word))) return 'blocked'
  }
  for (const word of words) {
    if (blockedWord(word)) return 'blocked'
    if (RESERVED.includes(word)) return 'reserved'
  }
  if (blockedWord(foldLetters(nickname, true)) || blockedWord(foldLetters(nickname, false))) return 'blocked'
  return null
}

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

export interface LiveRankRow {
  rank: number
  nickname: string
  score: number
  /** Points gained in the revealed question (reveal leaderboard). */
  gained?: number
  /** Part of `gained` that is the streak bonus (reveal leaderboard). */
  bonus?: number
  streak?: number
  /** Host only. */
  playerId?: string
}

export interface LiveGameInfo {
  id: string
  code: string
  /** The Archive quiz the game was made from (for "play again"). */
  quizId: string
  state: LiveGameStateName
  locked: boolean
  paused: boolean
  settings: LiveSettings
  quizTitle: string
  questionCount: number
  skippedCount: number
  currentIndex: number
  /** Epoch ms when the open question closes; null when paused or not in a question. */
  deadlineAt: number | null
  /** Epoch ms when the open question started (for the progress ring). */
  startedAt: number | null
  /** Time left while paused. */
  pausedRemainingMs: number | null
  channelKey: string
}

export interface LiveReveal {
  correct: number[]
  /** How many players chose each option. */
  counts: number[]
  explanation: string
  unanswered: number
  top: LiveRankRow[]
}

export interface LiveMe {
  nickname: string
  score: number
  streak: number
  rank: number
  answered: boolean
  myAnswer: number[] | null
  /** Result of the revealed question. */
  last: { index: number; correct: boolean; gained: number; bonus: number; streak: number } | null
}

export interface LiveHostPlayer {
  id: string
  nickname: string
  score: number
  answered: boolean
}

export interface LiveState {
  rev: number
  serverNow: number
  role: 'host' | 'player'
  game: LiveGameInfo
  question: LivePublicQuestion | null
  counts: { players: number; answered: number }
  reveal: LiveReveal | null
  players: LiveHostPlayer[] | null
  /** Final standings: everyone for the host, the first three for a student. */
  ranking: LiveRankRow[] | null
  me: LiveMe | null
}

export type LiveJoinError =
  | 'bad_code'
  | 'rate_limited'
  | 'game_started'
  | 'locked'
  | 'full'
  | 'nickname_taken'
  | 'nickname_too_short'
  | 'nickname_too_long'
  | 'nickname_invalid_chars'
  | 'nickname_blocked'
  | 'nickname_reserved'
  | 'finished'
  | 'removed'
  | 'unavailable'

export function nicknameErrorCode(problem: NicknameProblem): LiveJoinError {
  return `nickname_${problem}` as LiveJoinError
}

export interface LiveQuestionStat {
  index: number
  text: string
  kind: LiveKind
  answered: number
  correct: number
  /** 0..1 share of the players who answered right. */
  successRate: number
  counts: number[]
  correctOptions: number[]
  options: string[]
}

export interface LiveSummary {
  playerCount: number
  averageScore: number
  questions: LiveQuestionStat[]
  /** Index (into `questions`) of the hardest question, or null when nobody played. */
  hardest: number | null
}

export function buildSummary(
  questions: readonly LiveQuestionSnapshot[],
  playedIndices: readonly number[],
  players: readonly { score: number }[],
  answers: readonly { questionIndex: number; answer: readonly number[]; correct: boolean }[],
): LiveSummary {
  const stats: LiveQuestionStat[] = playedIndices.map((index) => {
    const question = questions[index]
    const given = answers.filter((answer) => answer.questionIndex === index)
    const counts = Array.from({ length: optionCount(question) }, () => 0)
    for (const answer of given) for (const option of answer.answer) if (option in counts) counts[option] += 1
    const correct = given.filter((answer) => answer.correct).length
    return {
      index,
      text: question.text,
      kind: question.kind,
      answered: given.length,
      correct,
      successRate: players.length > 0 ? correct / players.length : 0,
      counts,
      correctOptions: question.correct,
      options: question.options,
    }
  })
  let hardest: number | null = null
  stats.forEach((stat, i) => {
    if (players.length === 0) return
    if (hardest === null || stat.successRate < stats[hardest].successRate) hardest = i
  })
  const total = players.reduce((sum, player) => sum + player.score, 0)
  return { playerCount: players.length, averageScore: players.length > 0 ? Math.round(total / players.length) : 0, questions: stats, hardest }
}
