import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Database, Json } from '../../src/lib/database.types.js'
import {
  ACTIVE_STATES,
  LIVE_ANSWER_GRACE_MS,
  LIVE_CODE_LENGTH,
  LIVE_IDLE_MINUTES,
  LIVE_JOIN_ATTEMPTS_PER_MINUTE,
  LIVE_MAX_ACTIVE_GAMES,
  LIVE_MAX_QUESTIONS,
  buildSummary,
  cleanNickname,
  isActiveState,
  isCorrectAnswer,
  nicknameErrorCode,
  nicknameKey,
  nicknameProblem,
  normalizeCodeInput,
  optionCount,
  parseAnswer,
  planLiveQuestions,
  rankPlayers,
  sanitizeSettings,
  scorePlayer,
  streakBonus,
  toPublicQuestion,
} from '../../src/lib/live/core.js'
import type {
  LiveGameInfo,
  LiveGameStateName,
  LiveHostPlayer,
  LiveJoinError,
  LiveMe,
  LiveQuestionSnapshot,
  LiveRankRow,
  LiveReveal,
  LiveSettings,
  LiveState,
  LiveSummary,
} from '../../src/lib/live/core.js'
import type { GeneratedQuiz, QuizQuestion } from '../../src/lib/quiz.js'
import { readRequestBody } from './anthropic.js'
import { authenticate } from './auth.js'
import { getServiceClient, isServiceConfigured } from './supabase-server.js'
import { createUserRateLimit } from './user-rate-limit.js'

/** /api/live: everything the Live Game needs from the server. Teachers call it with their account token;
 * students have no account and call it with the per-game player token the server gave them at join.
 *
 * The browser never writes to the live tables and students never read them: this file is the only door.
 * It decides every transition (start, reveal, finish), timestamps and scores every answer, and never puts a
 * correct answer into a response before that question is revealed. Realtime carries "something changed"
 * hints only; every client then asks for the real state here, which is also how it recovers after a reload. */

type Db = ReturnType<typeof getServiceClient>
type GameRow = Database['public']['Tables']['live_games']['Row']
type PlayerRow = Database['public']['Tables']['live_players']['Row']
type AnswerRow = Database['public']['Tables']['live_answers']['Row']
type Body = Record<string, unknown>

const MAX_BODY_BYTES = 8192
const HEARTBEAT_MS = 60_000
const hostLimiter = createUserRateLimit(300)
/** Wrong-code budget per client address and minute: stops code guessing without blocking a whole classroom that shares one address. */
const WRONG_CODE_KEY = 'join-fail'
const ANY_ATTEMPT_KEY = 'join-any'
const ANY_ATTEMPT_PER_MINUTE = 600

class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

function respond(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function clientIp(req: IncomingMessage): string {
  const header = (name: string) => {
    const value = req.headers[name]
    return (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim()
  }
  return header('x-vercel-forwarded-for') || header('x-forwarded-for') || req.socket.remoteAddress || 'unknown'
}

function headerValue(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function newToken(): string {
  return randomBytes(24).toString('base64url')
}

async function readBody(req: IncomingMessage): Promise<Body> {
  try {
    const parsed: unknown = JSON.parse((await readRequestBody(req, MAX_BODY_BYTES)) || '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Body) : {}
  } catch {
    throw new ApiError(400, 'bad_request')
  }
}

function logFailure(step: string, error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : 'unknown'
  console.error(`[live] ${step} failed: ${message.slice(0, 160)}`)
}

function dbFail(step: string, error: unknown): never {
  logFailure(step, error)
  throw new ApiError(500, 'server_error')
}

// ---------------------------------------------------------------------------
// Realtime hints
// ---------------------------------------------------------------------------

/** Tells the clients of a game that something changed. The payload holds nothing but the change counter (and `tick` for
 * events that do not change the game itself, like a new answer): a spoofed
 * hint can only make a client ask the server, never show it wrong data. `hostOnly` is for events only the board cares about. */
async function sendHint(game: Pick<GameRow, 'channel_key' | 'rev'>, hostOnly = false): Promise<void> {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim()
  const key = (process.env.SUPABASE_SECRET_KEY ?? '').trim()
  if (!url || !key) return
  const topics = hostOnly ? [`liveh:${game.channel_key}`] : [`live:${game.channel_key}`, `liveh:${game.channel_key}`]
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: topics.map((topic) => ({ topic, event: 'rev', payload: hostOnly ? { rev: game.rev, tick: true } : { rev: game.rev }, private: false })) }),
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) logFailure('broadcast', new Error(`status ${response.status}`))
  } catch (error) {
    logFailure('broadcast', error)
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadGame(db: Db, id: string): Promise<GameRow | null> {
  const { data, error } = await db.from('live_games').select('*').eq('id', id).maybeSingle()
  if (error) dbFail('load game', error)
  return data
}

async function loadActiveGameByCode(db: Db, code: string): Promise<GameRow | null> {
  const { data, error } = await db.from('live_games').select('*').eq('code', code).in('state', [...ACTIVE_STATES]).maybeSingle()
  if (error) dbFail('load game by code', error)
  return data
}

async function loadPlayers(db: Db, gameId: string): Promise<PlayerRow[]> {
  const { data, error } = await db.from('live_players').select('*').eq('game_id', gameId).eq('removed', false).order('joined_at')
  if (error) dbFail('load players', error)
  return data
}

async function loadAnswers(db: Db, gameId: string, questionIndexes?: number[]): Promise<AnswerRow[]> {
  const rows: AnswerRow[] = []
  for (let from = 0; ; from += 1000) {
    let query = db.from('live_answers').select('*').eq('game_id', gameId)
    if (questionIndexes) query = query.in('question_index', questionIndexes)
    const { data, error } = await query.order('id').range(from, from + 999)
    if (error) dbFail('load answers', error)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

function settingsOf(game: GameRow): LiveSettings {
  return sanitizeSettings(game.settings)
}

function questionsOf(game: GameRow): LiveQuestionSnapshot[] {
  return game.questions as unknown as LiveQuestionSnapshot[]
}

function limitMsOf(game: GameRow): number {
  return settingsOf(game).secondsPerQuestion * 1000
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** Applies a change to a game and returns the updated row (rev goes up by one in the database). Optional guards make it a compare-and-set. */
async function updateGame(db: Db, id: string, patch: Database['public']['Tables']['live_games']['Update'], guard: { state?: string; index?: number } = {}): Promise<GameRow | null> {
  let query = db.from('live_games').update(patch).eq('id', id)
  if (guard.state !== undefined) query = query.eq('state', guard.state)
  if (guard.index !== undefined) query = query.eq('current_index', guard.index)
  const { data, error } = await query.select('*')
  if (error) dbFail('update game', error)
  return data[0] ?? null
}

/** Ends a game nobody has touched for 30 minutes. Returns the game as it is now. */
async function endIfIdle(db: Db, game: GameRow): Promise<GameRow> {
  if (!isActiveState(game.state)) return game
  if (Date.now() - new Date(game.last_activity_at).getTime() < LIVE_IDLE_MINUTES * 60_000) return game
  const ended = await updateGame(db, game.id, { state: 'ended', finished_at: new Date().toISOString(), paused: false, question_deadline: null }, { state: game.state })
  if (ended) {
    await sendHint(ended)
    return ended
  }
  return (await loadGame(db, game.id)) ?? game
}

/** Scores the open question for everyone, then moves the game to "reveal". Safe to run twice at once: both runs write the
 * same numbers and only one wins the state change. Returns the game after the call. */
async function revealQuestion(db: Db, game: GameRow): Promise<GameRow> {
  if (game.state !== 'question') return game
  const index = game.current_index
  const played = [...new Set([...game.played, index])].sort((a, b) => a - b)
  const players = await loadPlayers(db, game.id)
  const answers = await loadAnswers(db, game.id, played)
  const limitMs = limitMsOf(game)

  const byPlayer = new Map<string, AnswerRow[]>()
  for (const answer of answers) byPlayer.set(answer.player_id, [...(byPlayer.get(answer.player_id) ?? []), answer])

  const playerRows: PlayerRow[] = []
  const answerRows: Omit<AnswerRow, 'id'>[] = []
  for (const player of players) {
    const own = byPlayer.get(player.id) ?? []
    const totals = scorePlayer(own.map((answer) => ({ questionIndex: answer.question_index, correct: answer.correct, elapsedMs: answer.elapsed_ms })), played, limitMs)
    playerRows.push({ ...player, score: totals.score, streak: totals.streak, correct_count: totals.correctCount, total_time_ms: totals.totalTimeMs })
    const current = own.find((answer) => answer.question_index === index)
    const outcome = totals.outcomes.find((entry) => entry.questionIndex === index)
    if (current && outcome) {
      const { id: _id, ...rest } = current
      answerRows.push({ ...rest, points: outcome.points })
    }
  }
  if (playerRows.length > 0) {
    const { error } = await db.from('live_players').upsert(playerRows, { onConflict: 'id' })
    if (error) dbFail('score players', error)
  }
  if (answerRows.length > 0) {
    const { error } = await db.from('live_answers').upsert(answerRows, { onConflict: 'player_id,question_index' })
    if (error) dbFail('score answers', error)
  }

  const revealed = await updateGame(db, game.id, { state: 'reveal', question_deadline: null, paused: false, paused_remaining_ms: null, played }, { state: 'question', index })
  if (revealed) {
    await sendHint(revealed)
    return revealed
  }
  return (await loadGame(db, game.id)) ?? game
}

/** Moves a game forward without waiting for the teacher: the idle timeout, the question timer and "everyone answered". */
async function tick(db: Db, game: GameRow): Promise<GameRow> {
  let current = await endIfIdle(db, game)
  if (current.state !== 'question' || current.paused || !current.question_deadline) return current
  if (Date.now() >= new Date(current.question_deadline).getTime() + LIVE_ANSWER_GRACE_MS) return revealQuestion(db, current)
  const players = await loadPlayers(db, current.id)
  if (players.length > 0) {
    const { count, error } = await db.from('live_answers').select('id', { count: 'exact', head: true }).eq('game_id', current.id).eq('question_index', current.current_index).in('player_id', players.map((player) => player.id))
    if (error) dbFail('count answers', error)
    if ((count ?? 0) >= players.length) current = await revealQuestion(db, current)
  }
  return current
}

function openQuestion(game: GameRow, index: number): Database['public']['Tables']['live_games']['Update'] {
  const now = Date.now()
  return {
    state: 'question',
    current_index: index,
    paused: false,
    paused_remaining_ms: null,
    question_started_at: new Date(now).toISOString(),
    question_deadline: new Date(now + limitMsOf(game)).toISOString(),
    started_at: game.started_at ?? new Date(now).toISOString(),
    last_activity_at: new Date(now).toISOString(),
  }
}

async function finishGame(db: Db, game: GameRow): Promise<GameRow> {
  let current = game
  if (current.state === 'question') current = await revealQuestion(db, current)
  if (current.state === 'finished' || current.state === 'ended') return current
  const players = await loadPlayers(db, current.id)
  const answers = await loadAnswers(db, current.id, current.played.length > 0 ? current.played : [-1])
  const summary = buildSummary(
    questionsOf(current),
    current.played,
    players,
    answers.filter((answer) => players.some((player) => player.id === answer.player_id)).map((answer) => ({ questionIndex: answer.question_index, answer: answer.answer as unknown as number[], correct: answer.correct })),
  )
  const finished = await updateGame(db, current.id, {
    state: current.state === 'lobby' ? 'ended' : 'finished',
    finished_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    paused: false,
    question_deadline: null,
    summary: summary as unknown as Json,
  })
  if (finished) await sendHint(finished)
  return finished ?? current
}

// ---------------------------------------------------------------------------
// State for the board and the phones
// ---------------------------------------------------------------------------

function gameInfo(game: GameRow): LiveGameInfo {
  return {
    id: game.id,
    code: game.code,
    quizId: game.quiz_id,
    state: game.state as LiveGameStateName,
    locked: game.locked,
    paused: game.paused,
    settings: settingsOf(game),
    quizTitle: game.quiz_title,
    questionCount: game.question_count,
    skippedCount: game.skipped_count,
    currentIndex: game.current_index,
    deadlineAt: game.question_deadline ? new Date(game.question_deadline).getTime() : null,
    startedAt: game.question_started_at ? new Date(game.question_started_at).getTime() : null,
    pausedRemainingMs: game.paused ? game.paused_remaining_ms : null,
    channelKey: game.channel_key,
  }
}

function rankRows(players: PlayerRow[], gained?: Map<string, number>, withIds = false): LiveRankRow[] {
  return rankPlayers(players.map((player) => ({ id: player.id, nickname: player.nickname, score: player.score, totalTimeMs: Number(player.total_time_ms), streak: player.streak }))).map((row) => ({
    rank: row.rank,
    nickname: row.nickname,
    score: row.score,
    streak: row.streak,
    ...(gained ? { gained: gained.get(row.id) ?? 0 } : {}),
    ...(withIds ? { playerId: row.id } : {}),
  }))
}

async function buildState(db: Db, game: GameRow, viewer: { role: 'host' } | { role: 'player'; player: PlayerRow }): Promise<LiveState> {
  const players = await loadPlayers(db, game.id)
  const questions = questionsOf(game)
  const inQuestion = game.state === 'question' || game.state === 'reveal'
  const answers = inQuestion ? await loadAnswers(db, game.id, [game.current_index]) : []
  const answeredIds = new Set(answers.map((answer) => answer.player_id))
  const livePlayerIds = new Set(players.map((player) => player.id))
  const answeredCount = [...answeredIds].filter((id) => livePlayerIds.has(id)).length
  const limitSeconds = settingsOf(game).secondsPerQuestion

  const question = inQuestion ? toPublicQuestion(questions[game.current_index], game.current_index, game.question_count, limitSeconds) : null

  let reveal: LiveReveal | null = null
  if (game.state === 'reveal') {
    const current = questions[game.current_index]
    const counts = Array.from({ length: optionCount(current) }, () => 0)
    for (const answer of answers) {
      if (!livePlayerIds.has(answer.player_id)) continue
      for (const option of answer.answer as unknown as number[]) if (option in counts) counts[option] += 1
    }
    const gained = new Map(answers.map((answer) => [answer.player_id, answer.points]))
    reveal = {
      correct: current.correct,
      counts,
      explanation: current.explanation,
      unanswered: Math.max(0, players.length - answeredCount),
      top: rankRows(players, gained).slice(0, 5),
    }
  }

  const finishedLike = game.state === 'finished' || game.state === 'ended'
  const fullRanking = rankRows(players, undefined, viewer.role === 'host')

  let me: LiveMe | null = null
  if (viewer.role === 'player') {
    const mine = players.find((player) => player.id === viewer.player.id) ?? viewer.player
    const ownAnswer = answers.find((answer) => answer.player_id === mine.id)
    const rank = fullRanking.find((row) => row.nickname === mine.nickname)?.rank ?? fullRanking.length + 1
    me = {
      nickname: mine.nickname,
      score: mine.score,
      streak: mine.streak,
      rank,
      answered: Boolean(ownAnswer),
      myAnswer: ownAnswer ? (ownAnswer.answer as unknown as number[]) : null,
      last:
        game.state === 'reveal'
          ? { index: game.current_index, correct: ownAnswer?.correct ?? false, gained: ownAnswer?.points ?? 0, bonus: ownAnswer?.correct ? streakBonus(mine.streak) : 0, streak: mine.streak }
          : null,
    }
  }

  const hostPlayers: LiveHostPlayer[] | null =
    viewer.role === 'host' ? players.map((player) => ({ id: player.id, nickname: player.nickname, score: player.score, answered: answeredIds.has(player.id) })) : null

  return {
    rev: game.rev,
    serverNow: Date.now(),
    role: viewer.role,
    game: gameInfo(game),
    question,
    counts: { players: players.length, answered: answeredCount },
    reveal,
    players: hostPlayers,
    ranking: finishedLike ? (viewer.role === 'host' ? fullRanking : fullRanking.slice(0, 3)) : null,
    me,
  }
}

// ---------------------------------------------------------------------------
// Teacher actions
// ---------------------------------------------------------------------------

async function ownedGame(db: Db, id: unknown, userId: string): Promise<GameRow> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(404, 'not_found')
  const game = await loadGame(db, id)
  // Another teacher's game looks exactly like a game that does not exist.
  if (!game || game.owner_id !== userId) throw new ApiError(404, 'not_found')
  return game
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function createGame(db: Db, userId: string, body: Body): Promise<{ id: string; code: string }> {
  const quizId = typeof body.quizId === 'string' ? body.quizId.slice(0, 80) : ''
  if (!quizId) throw new ApiError(400, 'bad_request')
  const settings = sanitizeSettings(body.settings)

  // Games nobody touches end by themselves; do that before counting so a forgotten lobby does not use up the limit.
  const { data: open, error: openError } = await db.from('live_games').select('*').eq('owner_id', userId).in('state', [...ACTIVE_STATES])
  if (openError) dbFail('count games', openError)
  let activeCount = 0
  for (const game of open) {
    const current = await endIfIdle(db, game)
    if (isActiveState(current.state)) activeCount += 1
  }
  if (activeCount >= LIVE_MAX_ACTIVE_GAMES) throw new ApiError(409, 'too_many_games')

  const { data: quizRow, error: quizError } = await db.from('quizzes').select('id, title, quiz').eq('id', quizId).eq('user_id', userId).maybeSingle()
  if (quizError) dbFail('load quiz', quizError)
  if (!quizRow) throw new ApiError(404, 'quiz_not_found')
  const quiz = quizRow.quiz as unknown as GeneratedQuiz
  if (!isRecord(quiz) || !Array.isArray(quiz.questions)) throw new ApiError(422, 'no_playable_questions')

  const plan = planLiveQuestions(quiz.questions as QuizQuestion[])
  const playable = (settings.shuffleQuestions ? shuffled(plan.questions) : plan.questions).slice(0, LIVE_MAX_QUESTIONS)
  if (playable.length === 0) throw new ApiError(422, 'no_playable_questions')

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = String(randomInt(10 ** (LIVE_CODE_LENGTH - 1), 10 ** LIVE_CODE_LENGTH))
    const { data, error } = await db
      .from('live_games')
      .insert({
        owner_id: userId,
        quiz_id: quizRow.id,
        quiz_title: (quizRow.title || quiz.title || '').slice(0, 300),
        code,
        channel_key: randomBytes(18).toString('base64url'),
        settings: settings as unknown as Json,
        questions: playable as unknown as Json,
        question_count: playable.length,
        skipped_count: plan.skipped.length + Math.max(0, plan.questions.length - playable.length),
      })
      .select('id, code')
      .single()
    if (!error) return data
    if (error.code !== '23505') dbFail('create game', error)
  }
  throw new ApiError(503, 'code_unavailable')
}

type HostCommand = 'start' | 'next' | 'end-question' | 'skip' | 'pause' | 'resume' | 'lock' | 'unlock' | 'kick' | 'finish' | 'close'

async function runHostCommand(db: Db, game: GameRow, command: HostCommand, body: Body): Promise<GameRow> {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  if (!isActiveState(game.state)) throw new ApiError(409, 'game_over')

  switch (command) {
    case 'start': {
      if (game.state !== 'lobby') throw new ApiError(409, 'bad_state')
      const players = await loadPlayers(db, game.id)
      if (players.length < 1) throw new ApiError(409, 'no_players')
      return (await updateGame(db, game.id, openQuestion(game, 0), { state: 'lobby' })) ?? game
    }
    case 'next': {
      // One key for the whole flow: start from the lobby, show the answer during a question, move on from a reveal.
      if (game.state === 'lobby') return runHostCommand(db, game, 'start', body)
      if (game.state === 'question') return revealQuestion(db, game)
      if (game.current_index + 1 >= game.question_count) return finishGame(db, game)
      return (await updateGame(db, game.id, openQuestion(game, game.current_index + 1), { state: 'reveal', index: game.current_index })) ?? game
    }
    case 'end-question': {
      if (game.state !== 'question') throw new ApiError(409, 'bad_state')
      return revealQuestion(db, game)
    }
    case 'skip': {
      if (game.state !== 'question' && game.state !== 'reveal') throw new ApiError(409, 'bad_state')
      const index = game.current_index
      if (game.state === 'question') {
        // A skipped question never counts: its answers are dropped and it is not in `played`.
        const { error } = await db.from('live_answers').delete().eq('game_id', game.id).eq('question_index', index)
        if (error) dbFail('drop skipped answers', error)
      }
      if (index + 1 >= game.question_count) return finishGame(db, { ...game, state: game.state === 'question' ? 'reveal' : game.state })
      return (await updateGame(db, game.id, openQuestion(game, index + 1), { index })) ?? game
    }
    case 'pause': {
      if (game.state !== 'question' || game.paused || !game.question_deadline) throw new ApiError(409, 'bad_state')
      const remaining = Math.max(0, new Date(game.question_deadline).getTime() - now)
      return (await updateGame(db, game.id, { paused: true, paused_remaining_ms: remaining, question_deadline: null, last_activity_at: nowIso }, { state: 'question', index: game.current_index })) ?? game
    }
    case 'resume': {
      if (game.state !== 'question' || !game.paused) throw new ApiError(409, 'bad_state')
      const remaining = game.paused_remaining_ms ?? 0
      // The start moves forward by the time spent paused, so "elapsed" keeps meaning "time the students actually had".
      return (
        (await updateGame(
          db,
          game.id,
          { paused: false, paused_remaining_ms: null, question_deadline: new Date(now + remaining).toISOString(), question_started_at: new Date(now - (limitMsOf(game) - remaining)).toISOString(), last_activity_at: nowIso },
          { state: 'question', index: game.current_index },
        )) ?? game
      )
    }
    case 'lock':
    case 'unlock':
      return (await updateGame(db, game.id, { locked: command === 'lock', last_activity_at: nowIso })) ?? game
    case 'kick': {
      const playerId = typeof body.playerId === 'string' ? body.playerId : ''
      const { data, error } = await db.from('live_players').update({ removed: true }).eq('id', playerId).eq('game_id', game.id).select('id')
      if (error) dbFail('remove player', error)
      if (data.length === 0) throw new ApiError(404, 'player_not_found')
      return (await updateGame(db, game.id, { last_activity_at: nowIso })) ?? game
    }
    case 'finish':
      return finishGame(db, game)
    case 'close':
      return (await updateGame(db, game.id, { state: 'ended', finished_at: nowIso, paused: false, question_deadline: null })) ?? game
    default:
      throw new ApiError(400, 'bad_request')
  }
}

const HOST_COMMANDS: readonly HostCommand[] = ['start', 'next', 'end-question', 'skip', 'pause', 'resume', 'lock', 'unlock', 'kick', 'finish', 'close']

async function handleHost(req: IncomingMessage, res: ServerResponse, action: string, url: URL): Promise<void> {
  const auth = await authenticate(req)
  if (auth.status === 'unavailable') throw new ApiError(503, 'auth_unavailable')
  if (auth.status !== 'ok') throw new ApiError(401, 'unauthorized')
  if (!hostLimiter.take(auth.user.id)) {
    res.setHeader('retry-after', '10')
    throw new ApiError(429, 'rate_limited')
  }
  const db = getServiceClient()
  const userId = auth.user.id

  if (action === 'create') {
    const body = await readBody(req)
    respond(res, 200, await createGame(db, userId, body))
    return
  }

  if (action === 'host-state') {
    let game = await ownedGame(db, url.searchParams.get('id'), userId)
    // A board that is open and polling is teacher activity: the 30-minute idle timer restarts (written at most once a minute).
    if (isActiveState(game.state) && Date.now() - new Date(game.last_activity_at).getTime() > HEARTBEAT_MS) {
      game = (await updateGame(db, game.id, { last_activity_at: new Date().toISOString() })) ?? game
    }
    game = await tick(db, game)
    respond(res, 200, await buildState(db, game, { role: 'host' }))
    return
  }

  if (action === 'results') {
    const game = await ownedGame(db, url.searchParams.get('id'), userId)
    const players = game.ranking_purged_at ? [] : await loadPlayers(db, game.id)
    respond(res, 200, {
      game: gameInfo(game),
      createdAt: game.created_at,
      finishedAt: game.finished_at,
      summary: (game.summary as unknown as LiveSummary | null) ?? null,
      ranking: game.ranking_purged_at ? null : rankRows(players),
      rankingPurged: Boolean(game.ranking_purged_at),
    })
    return
  }

  if (action === 'command') {
    const body = await readBody(req)
    const command = body.command as HostCommand
    if (!HOST_COMMANDS.includes(command)) throw new ApiError(400, 'bad_request')
    let game = await ownedGame(db, body.id, userId)
    game = await tick(db, game)
    const before = game.rev
    game = await runHostCommand(db, game, command, body)
    if (game.rev !== before) await sendHint(game)
    respond(res, 200, await buildState(db, game, { role: 'host' }))
    return
  }

  throw new ApiError(404, 'unknown_action')
}

// ---------------------------------------------------------------------------
// Student actions
// ---------------------------------------------------------------------------

async function checkJoinBudget(db: Db, req: IncomingMessage): Promise<string> {
  const ip = clientIp(req)
  const { data: blocked, error } = await db.rpc('live_rate_blocked', { p_key: `${WRONG_CODE_KEY}:${ip}`, p_window_seconds: 60, p_max: LIVE_JOIN_ATTEMPTS_PER_MINUTE })
  if (error) dbFail('rate check', error)
  const { data: allowed, error: anyError } = await db.rpc('live_rate_hit', { p_key: `${ANY_ATTEMPT_KEY}:${ip}`, p_window_seconds: 60, p_max: ANY_ATTEMPT_PER_MINUTE })
  if (anyError) dbFail('rate hit', anyError)
  if (blocked || !allowed) throw new ApiError(429, 'rate_limited')
  return ip
}

async function noteWrongCode(db: Db, ip: string): Promise<never> {
  await db.rpc('live_rate_hit', { p_key: `${WRONG_CODE_KEY}:${ip}`, p_window_seconds: 60, p_max: LIVE_JOIN_ATTEMPTS_PER_MINUTE })
  throw new ApiError(404, 'bad_code')
}

function joinProblem(game: GameRow): LiveJoinError | null {
  if (game.locked) return 'locked'
  const settings = settingsOf(game)
  if (game.state !== 'lobby') {
    if (!settings.lateJoin) return 'game_started'
    // Late joiners are welcome until the last question starts.
    if (game.current_index >= game.question_count - 1) return 'game_started'
  }
  return null
}

async function loadPlayerByToken(db: Db, token: string): Promise<PlayerRow | null> {
  if (!token || token.length > 128) return null
  const { data, error } = await db.from('live_players').select('*').eq('token_hash', hashToken(token)).maybeSingle()
  if (error) dbFail('load player', error)
  return data
}

async function handleCheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = getServiceClient()
  const ip = await checkJoinBudget(db, req)
  const body = await readBody(req)
  const code = normalizeCodeInput(body.code)
  if (!code) return noteWrongCode(db, ip)
  const game = await loadActiveGameByCode(db, code)
  if (!game) return noteWrongCode(db, ip)
  const players = await loadPlayers(db, game.id)
  const problem = joinProblem(game) ?? (players.length >= settingsOf(game).maxPlayers ? 'full' : null)
  respond(res, 200, { ok: problem === null, problem, quizTitle: game.quiz_title })
}

async function handleJoin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = getServiceClient()
  const ip = await checkJoinBudget(db, req)
  const body = await readBody(req)
  const code = normalizeCodeInput(body.code)
  if (!code) return noteWrongCode(db, ip)
  const game = await loadActiveGameByCode(db, code)
  if (!game) return noteWrongCode(db, ip)

  // Same device coming back (reload, dropped connection): the stored token returns the same player.
  const knownToken = typeof body.token === 'string' ? body.token : ''
  if (knownToken) {
    const existing = await loadPlayerByToken(db, knownToken)
    if (existing && existing.game_id === game.id) {
      if (existing.removed) throw new ApiError(403, 'removed')
      respond(res, 200, { token: knownToken, state: await buildState(db, await tick(db, game), { role: 'player', player: existing }) })
      return
    }
  }

  const problem = joinProblem(game)
  if (problem) throw new ApiError(409, problem)

  const nickname = cleanNickname(body.nickname)
  const nicknameIssue = nicknameProblem(nickname)
  if (nicknameIssue) throw new ApiError(422, nicknameErrorCode(nicknameIssue))

  const settings = settingsOf(game)
  const current = await loadPlayers(db, game.id)
  if (current.length >= settings.maxPlayers) throw new ApiError(409, 'full')

  const token = newToken()
  const { data: player, error } = await db
    .from('live_players')
    .insert({ game_id: game.id, nickname, nickname_key: nicknameKey(nickname), token_hash: hashToken(token) })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'nickname_taken')
    dbFail('join', error)
  }
  // Two students taking the last seat at once: the one who finished second steps back.
  const after = await loadPlayers(db, game.id)
  if (after.length > settings.maxPlayers && after[after.length - 1].id === player.id) {
    await db.from('live_players').delete().eq('id', player.id)
    throw new ApiError(409, 'full')
  }

  const touched = await updateGame(db, game.id, { locked: game.locked })
  if (touched) await sendHint(touched, true)
  respond(res, 200, { token, state: await buildState(db, touched ?? game, { role: 'player', player }) })
}

async function handlePlayerState(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = getServiceClient()
  const player = await loadPlayerByToken(db, headerValue(req, 'x-live-token'))
  if (!player) throw new ApiError(401, 'unauthorized')
  if (player.removed) throw new ApiError(403, 'removed')
  const game = await loadGame(db, player.game_id)
  if (!game) throw new ApiError(404, 'not_found')
  respond(res, 200, await buildState(db, await tick(db, game), { role: 'player', player }))
}

async function handleAnswer(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = getServiceClient()
  const player = await loadPlayerByToken(db, headerValue(req, 'x-live-token'))
  if (!player) throw new ApiError(401, 'unauthorized')
  if (player.removed) throw new ApiError(403, 'removed')
  const body = await readBody(req)
  const receivedAt = Date.now()

  let game = await loadGame(db, player.game_id)
  if (!game) throw new ApiError(404, 'not_found')
  game = await tick(db, game)
  const index = typeof body.index === 'number' ? body.index : -1
  // Only the question that is open right now can be answered (the server's own idea of "now", never the phone's clock).
  if (game.state !== 'question' || index !== game.current_index) throw new ApiError(409, 'not_current')
  if (game.paused || !game.question_deadline || !game.question_started_at) throw new ApiError(409, 'paused')
  if (receivedAt > new Date(game.question_deadline).getTime() + LIVE_ANSWER_GRACE_MS) throw new ApiError(409, 'late')

  const question = questionsOf(game)[index]
  const answer = parseAnswer(body.answer, question)
  if (!answer) throw new ApiError(400, 'bad_answer')

  const limitMs = limitMsOf(game)
  const elapsed = Math.min(limitMs, Math.max(0, receivedAt - new Date(game.question_started_at).getTime()))
  const { error } = await db.from('live_answers').insert({
    game_id: game.id,
    player_id: player.id,
    question_index: index,
    answer: answer as unknown as Json,
    received_at: new Date(receivedAt).toISOString(),
    elapsed_ms: elapsed,
    correct: isCorrectAnswer(answer, question.correct),
  })
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'duplicate')
    dbFail('save answer', error)
  }

  // Everyone in? Show the answer at once. Otherwise only the board hears about it (live "18 / 23 answered").
  const after = await tick(db, game)
  if (after.state === 'question') await sendHint(after, true)
  respond(res, 200, { ok: true })
}

// ---------------------------------------------------------------------------
// Scheduled cleanup
// ---------------------------------------------------------------------------

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handleCleanup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = (process.env.CRON_SECRET ?? '').trim()
  if (!secret) throw new ApiError(401, 'unauthorized')
  const match = /^Bearer\s+(.+)$/i.exec(headerValue(req, 'authorization'))
  if (!match || !sameSecret(match[1].trim(), secret)) throw new ApiError(401, 'unauthorized')
  const { data, error } = await getServiceClient().rpc('live_cleanup')
  if (error) dbFail('cleanup', error)
  respond(res, 200, data)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function liveRequestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!isServiceConfigured()) throw new ApiError(503, 'unavailable')
    const url = new URL((req as { originalUrl?: string }).originalUrl ?? req.url ?? '/', 'http://localhost')
    const action = url.searchParams.get('action') ?? ''
    const method = req.method ?? 'GET'

    switch (action) {
      case 'check':
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        return await handleCheck(req, res)
      case 'join':
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        return await handleJoin(req, res)
      case 'state':
        if (method !== 'GET') throw new ApiError(405, 'method_not_allowed')
        return await handlePlayerState(req, res)
      case 'answer':
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        return await handleAnswer(req, res)
      case 'cleanup':
        return await handleCleanup(req, res)
      case 'create':
      case 'command':
        if (method !== 'POST') throw new ApiError(405, 'method_not_allowed')
        return await handleHost(req, res, action, url)
      case 'host-state':
      case 'results':
        if (method !== 'GET') throw new ApiError(405, 'method_not_allowed')
        return await handleHost(req, res, action, url)
      default:
        throw new ApiError(404, 'unknown_action')
    }
  } catch (error) {
    if (error instanceof ApiError) {
      respond(res, error.status, { error: error.code })
      return
    }
    logFailure('request', error)
    respond(res, 500, { error: 'server_error' })
  }
}
