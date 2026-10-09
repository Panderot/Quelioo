import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

import { testEnv } from '../supabase/env'
import { cleanupTestUsers } from '../supabase/helpers'
import { admin, answer, command, createGame, createTestUser, hostState, insertQuiz, joinGame, live, playerState, sleep, CRON_SECRET } from './helpers'
import type { TestUser } from './helpers'
import type { LiveSettings } from '../../src/lib/live/core'

test.afterAll(async () => {
  await cleanupTestUsers()
})

// sampleQuestions() as a live game, in this order: 0 single (right = option 1), 1 true/false (true = 0),
// 2 multi (right = 0 and 2), 3 true/false (true = 0), 4 single (right = option 1).

async function setup(names: string[], settings: Partial<LiveSettings> = {}) {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const created = await createGame(teacher, quizId, { secondsPerQuestion: 10, sound: false, ...settings })
  expect(created.status).toBe(200)
  const { id, code } = created.body
  const players: { name: string; token: string }[] = []
  for (const name of names) {
    const joined = await joinGame(code, name)
    expect(joined.status, `join ${name}`).toBe(200)
    players.push({ name, token: joined.body.token })
  }
  return { teacher, quizId, id, code, players }
}

test('scoring, streaks, multi-answer exactness and the reveal numbers', async () => {
  const { teacher, id, players } = await setup(['Ayse', 'Mehmet'])
  const [a, b] = players
  expect((await command(teacher, id, 'start')).status).toBe(200)

  // Q0: Ayse right, Mehmet wrong.
  await answer(a.token, 0, [1])
  await answer(b.token, 0, [0])
  let state = await hostState(teacher, id)
  expect(state.game.state).toBe('reveal')
  expect(state.reveal?.counts).toEqual([1, 1, 0, 0])
  const a0 = (await playerState(a.token)).body.me!
  expect(a0.last).toMatchObject({ correct: true, bonus: 0 })
  expect(a0.last!.gained).toBeGreaterThanOrEqual(900)
  expect(a0.last!.gained).toBeLessThanOrEqual(1000)
  expect((await playerState(b.token)).body.me!.last).toMatchObject({ correct: false, gained: 0, streak: 0 })

  // Q1 (true/false): both right, Mehmet a second later, so Ayse earns more; Ayse's streak is 2 (+100).
  await command(teacher, id, 'next')
  await answer(a.token, 1, [0])
  await sleep(1200)
  await answer(b.token, 1, [0])
  const a1 = (await playerState(a.token)).body.me!
  const b1 = (await playerState(b.token)).body.me!
  expect(a1.last).toMatchObject({ correct: true, bonus: 100, streak: 2 })
  expect(b1.last).toMatchObject({ correct: true, bonus: 0, streak: 1 })
  expect(a1.last!.gained).toBeGreaterThan(b1.last!.gained + 100)
  expect(a1.score).toBe(a0.score + a1.last!.gained)

  // Q2 (multi): Ayse exactly right (+200 streak bonus), Mehmet only one of the two (nothing).
  await command(teacher, id, 'next')
  const q2 = await playerState(a.token)
  expect(q2.body.question?.kind).toBe('multi')
  await answer(a.token, 2, [2, 0])
  await answer(b.token, 2, [0])
  const a2 = (await playerState(a.token)).body.me!
  const b2 = (await playerState(b.token)).body.me!
  expect(a2.last).toMatchObject({ correct: true, bonus: 200, streak: 3 })
  expect(b2.last).toMatchObject({ correct: false, gained: 0, streak: 0 })
  state = await hostState(teacher, id)
  expect(state.reveal?.correct).toEqual([0, 2])
  expect(state.ranking).toBeNull()
  expect(state.reveal?.top[0]).toMatchObject({ rank: 1, nickname: 'Ayse' })
})

test('tie-break: equal scores are decided by total answer time', async () => {
  const { teacher, id, players } = await setup(['Slow', 'Quick'])
  const [slow, quick] = players
  await command(teacher, id, 'start')
  await answer(quick.token, 0, [0])
  await sleep(1500)
  await answer(slow.token, 0, [0])
  const state = await hostState(teacher, id)
  expect(state.game.state).toBe('reveal')
  expect(state.reveal?.top.map((row) => [row.nickname, row.rank, row.score])).toEqual([
    ['Quick', 1, 0],
    ['Slow', 2, 0],
  ])
})

test('unanswered question: timer end reveals it, the player scores nothing and the streak resets', async () => {
  const { teacher, id, players } = await setup(['Solo'])
  await command(teacher, id, 'start')
  await answer(players[0].token, 0, [1])
  await command(teacher, id, 'next')
  await command(teacher, id, 'next') // show answer for question 1 without an answer
  const me = (await playerState(players[0].token)).body.me!
  expect(me.last).toMatchObject({ correct: false, gained: 0, streak: 0 })
  expect(me.answered).toBe(false)
})

test('answers are refused: after the deadline, twice, for a question that is not current, junk, wrong token', async () => {
  const { teacher, id, players } = await setup(['One', 'Two'])
  await command(teacher, id, 'start')

  expect((await answer(players[0].token, 1, [0])).body.error).toBe('not_current')
  expect((await answer(players[0].token, 0, [9])).body.error).toBe('bad_answer')
  expect((await answer(players[0].token, 0, [0, 1])).body.error).toBe('bad_answer')
  expect((await answer('not-a-token', 0, [0])).status).toBe(401)
  expect((await answer(players[0].token, 0, [0])).status).toBe(200)
  expect((await answer(players[0].token, 0, [1])).body.error).toBe('duplicate')

  // Push the deadline into the past: the late answer is refused and nothing is stored for it.
  await admin.from('live_games').update({ question_deadline: new Date(Date.now() - 2000).toISOString() }).eq('id', id)
  const late = await answer(players[1].token, 0, [1])
  expect(late.status).toBe(409)
  const { data } = await admin.from('live_answers').select('player_id').eq('game_id', id)
  expect(data).toHaveLength(1)
  // The timer ran out, so the question is now revealed even though nobody pressed anything.
  expect((await hostState(teacher, id)).game.state).toBe('reveal')
})

test('pause stops the clock and refuses answers; resume gives back the remaining time', async () => {
  const { teacher, id, players } = await setup(['One'])
  await command(teacher, id, 'start')
  await sleep(1000)
  const paused = await command(teacher, id, 'pause')
  expect(paused.body.game.paused).toBe(true)
  expect(paused.body.game.pausedRemainingMs).toBeLessThanOrEqual(9100)
  expect(paused.body.game.deadlineAt).toBeNull()
  expect((await answer(players[0].token, 0, [1])).body.error).toBe('paused')
  await sleep(1500)
  const resumed = await command(teacher, id, 'resume')
  const left = resumed.body.game.deadlineAt! - Date.now()
  expect(left).toBeGreaterThan(7500)
  expect(left).toBeLessThanOrEqual(9100)
  expect((await answer(players[0].token, 0, [1])).status).toBe(200)
})

test('skip drops the question, end-question reveals it, finish stores aggregates only', async () => {
  const { teacher, id, players } = await setup(['One', 'Two'])
  await command(teacher, id, 'start')
  await answer(players[0].token, 0, [1])
  const skipped = await command(teacher, id, 'skip')
  expect(skipped.body.game.currentIndex).toBe(1)
  expect(skipped.body.game.state).toBe('question')
  expect((await playerState(players[0].token)).body.me!.score).toBe(0)
  await answer(players[0].token, 1, [0])
  expect((await command(teacher, id, 'end-question')).body.game.state).toBe('reveal')
  const finished = await command(teacher, id, 'finish')
  expect(finished.body.game.state).toBe('finished')
  expect(finished.body.ranking?.[0]).toMatchObject({ nickname: 'One', rank: 1 })
  const results = await live<{ summary: { playerCount: number; questions: { index: number; successRate: number }[] }; ranking: unknown[] }>('results', { id }, { token: teacher.accessToken })
  expect(results.body.summary.playerCount).toBe(2)
  // Question 0 was skipped: only question 1 is in the statistics.
  expect(results.body.summary.questions.map((q) => q.index)).toEqual([1])
  expect(JSON.stringify((await admin.from('live_games').select('summary').eq('id', id).single()).data)).not.toContain('One')
  // Student view of the final ranking: the top three only.
  const mine = await playerState(players[1].token)
  expect(mine.body.game.state).toBe('finished')
  expect(mine.body.ranking!.length).toBeLessThanOrEqual(3)
})

test('a full game ends in "finished" and the last "next" shows the podium', async () => {
  const { teacher, id, players } = await setup(['One'])
  await command(teacher, id, 'start')
  for (let index = 0; index < 5; index += 1) {
    await answer(players[0].token, index, [index === 2 ? 0 : index === 1 || index === 3 ? 0 : 1])
    const afterReveal = await hostState(teacher, id)
    expect(afterReveal.game.state).toBe('reveal')
    const next = await command(teacher, id, 'next')
    expect(next.body.game.state).toBe(index === 4 ? 'finished' : 'question')
  }
  const state = await hostState(teacher, id)
  expect(state.ranking).toHaveLength(1)
})

test('joining: locked lobby, late join rules, full game, nicknames, remove and rejoin', async () => {
  const { teacher, id, code, players } = await setup(['Ayse'], { maxPlayers: 3 })

  // Nickname rules (same name in another case or with accents counts as taken).
  expect((await joinGame(code, 'ayse')).body.error).toBe('nickname_taken')
  expect((await joinGame(code, 'Ayşe')).body.error).toBe('nickname_taken')
  expect((await joinGame(code, 'x')).body.error).toBe('nickname_too_short')
  expect((await joinGame(code, 'siktir')).body.error).toBe('nickname_blocked')
  expect((await joinGame(code, 'Öğretmen')).body.error).toBe('nickname_reserved')
  expect((await joinGame(code, '<b>hi</b>')).body.error).toBe('nickname_invalid_chars')

  // Lock.
  await command(teacher, id, 'lock')
  expect((await joinGame(code, 'Late')).body.error).toBe('locked')
  await command(teacher, id, 'unlock')

  // Full.
  expect((await joinGame(code, 'Two')).status).toBe(200)
  const three = await joinGame(code, 'Three')
  expect(three.status).toBe(200)
  expect((await joinGame(code, 'Four')).body.error).toBe('full')

  // Remove a player: their token stops working, they cannot rejoin with it, and the nickname is free again.
  const removed = (await hostState(teacher, id)).players!.find((p) => p.nickname === 'Three')!
  await command(teacher, id, 'kick', { playerId: removed.id })
  expect((await playerState(three.body.token)).status).toBe(403)
  expect((await joinGame(code, 'Three', { token: three.body.token })).status).toBe(403)
  expect((await joinGame(code, 'Three')).status).toBe(200)

  // Reconnect: the same token returns the same player.
  const again = await joinGame(code, 'ignored', { token: players[0].token })
  expect(again.status).toBe(200)
  expect(again.body.token).toBe(players[0].token)
  expect(again.body.state.me?.nickname).toBe('Ayse')
})

test('late joiners are accepted mid-game but not during the last question, or when the teacher turned it off', async () => {
  const { teacher, id, code } = await setup(['Ayse'])
  await command(teacher, id, 'start')
  const late = await joinGame(code, 'Latecomer')
  expect(late.status).toBe(200)
  expect(late.body.state.me).toMatchObject({ score: 0, streak: 0 })
  await admin.from('live_games').update({ current_index: 4 }).eq('id', id)
  expect((await joinGame(code, 'TooLate')).body.error).toBe('game_started')

  const off = await setup(['Ayse'], { lateJoin: false })
  await command(off.teacher, off.id, 'start')
  expect((await joinGame(off.code, 'Nope')).body.error).toBe('game_started')
})

test('wrong code, bad format and a finished game all look like "no such game"', async () => {
  const { teacher, id, code } = await setup(['Ayse'])
  expect((await joinGame('000000', 'Ayse')).body.error).toBe('bad_code')
  expect((await joinGame('12', 'Ayse')).body.error).toBe('bad_code')
  await command(teacher, id, 'close')
  expect((await joinGame(code, 'Ayse')).body.error).toBe('bad_code')
})

test('a teacher hosts at most 3 unfinished games at once', async () => {
  const teacher = await createTestUser('host')
  const quizId = await insertQuiz(teacher)
  const ids: string[] = []
  for (let i = 0; i < 3; i += 1) {
    const created = await createGame(teacher, quizId)
    expect(created.status).toBe(200)
    ids.push(created.body.id)
  }
  const fourth = await createGame(teacher, quizId)
  expect(fourth.status).toBe(409)
  expect(fourth.body.error).toBe('too_many_games')
  await command(teacher, ids[0], 'close')
  expect((await createGame(teacher, quizId)).status).toBe(200)
})

test('a quiz with nothing playable cannot open a lobby; a quiz that is not yours is not found', async () => {
  const teacher = await createTestUser('host')
  const other = await createTestUser('other')
  const onlyBlanks = await insertQuiz(teacher, [{ id: 'f1', question: 'Fill', explanation: '', type: 'fill-blanks', answer: 'x' }])
  const none = await createGame(teacher, onlyBlanks)
  expect(none.status).toBe(422)
  expect(none.body.error).toBe('no_playable_questions')
  const foreign = await createGame(other, onlyBlanks)
  expect(foreign.status).toBe(404)
})

test('a game nobody touches for 30 minutes ends by itself', async () => {
  const { teacher, id, players } = await setup(['Ayse'])
  await admin.from('live_games').update({ last_activity_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq('id', id)
  const state = await playerState(players[0].token)
  expect(state.body.game.state).toBe('ended')
  expect((await command(teacher, id, 'start')).status).toBe(409)
})

test('the board closing and coming back (teacher reload) resumes at the same moment', async () => {
  const { teacher, id, players } = await setup(['Ayse'])
  await command(teacher, id, 'start')
  await answer(players[0].token, 0, [1])
  const first = await hostState(teacher, id)
  const second = await hostState(teacher, id)
  expect(second.game.state).toBe(first.game.state)
  expect(second.counts).toEqual(first.counts)
  expect(second.game.currentIndex).toBe(0)
})

// ---------------------------------------------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------------------------------------------

test('security: a student never receives a correct answer, other players, or the question snapshot before the reveal', async () => {
  const { teacher, id, players } = await setup(['One', 'Two'])
  await command(teacher, id, 'start')
  const view = await playerState(players[0].token)
  const text = JSON.stringify(view.body)
  expect(view.body.reveal).toBeNull()
  expect(view.body.players).toBeNull()
  expect(view.body.ranking).toBeNull()
  expect(text).not.toContain('Two')
  expect(text).not.toContain('explanation')
  expect(text).not.toContain('"correct"')
  expect(text).not.toContain('answerIndex')
  expect(text).not.toContain('Because q1')
  // Not even the teacher-only list or the other player's answer state leaks.
  expect(view.body.me).toMatchObject({ nickname: 'One', answered: false })
  // After the reveal the right answer is public.
  await command(teacher, id, 'end-question')
  const revealed = await playerState(players[0].token)
  expect(revealed.body.reveal?.correct).toEqual([1])
})

test('security: the browser cannot read or write the live tables directly', async () => {
  const { teacher, id, players } = await setup(['One'])
  await command(teacher, id, 'start')
  const anon = createClient(testEnv.url, testEnv.publishableKey, { auth: { persistSession: false } })
  for (const table of ['live_games', 'live_players', 'live_answers', 'live_rate'] as const) {
    const result = await anon.from(table).select('*')
    expect(result.data ?? [], `${table} as anon`).toEqual([])
  }
  // A signed-in teacher: own game yes (no snapshot, no token hashes), writes never.
  const own = await teacher.client.from('live_games').select('id, state, code').eq('id', id)
  expect(own.data).toHaveLength(1)
  expect((await teacher.client.from('live_games').select('questions').eq('id', id)).error).not.toBeNull()
  expect((await teacher.client.from('live_players').select('token_hash')).error).not.toBeNull()
  expect((await teacher.client.from('live_games').update({ state: 'finished' }).eq('id', id)).error).not.toBeNull()
  expect((await teacher.client.from('live_games').delete().eq('id', id)).error).not.toBeNull()
  expect((await teacher.client.from('live_answers').insert({ game_id: id, player_id: id, question_index: 0, answer: [0], elapsed_ms: 1, correct: true })).error).not.toBeNull()
  const player = await teacher.client.from('live_players').select('nickname').eq('game_id', id)
  expect(player.data).toEqual([{ nickname: 'One' }])
  expect((await playerState(players[0].token)).body.game.state).toBe('question')
})

test('security: a teacher cannot see or control another teacher\'s game', async () => {
  const { teacher, id, code, players } = await setup(['One'])
  const intruder: TestUser = await createTestUser('intruder')
  for (const name of ['start', 'next', 'finish', 'close', 'lock']) {
    const result = await command(intruder, id, name)
    expect(result.status, name).toBe(404)
  }
  expect((await live('host-state', { id }, { token: intruder.accessToken })).status).toBe(404)
  expect((await live('results', { id }, { token: intruder.accessToken })).status).toBe(404)
  const rows = await intruder.client.from('live_games').select('id')
  expect(rows.data).toEqual([])
  expect((await intruder.client.from('live_players').select('id')).data).toEqual([])
  expect((await intruder.client.from('live_answers').select('game_id')).data).toEqual([])
  // Without a token, or with a student's token, the teacher endpoints say 401.
  expect((await live('host-state', { id })).status).toBe(401)
  expect((await live('host-state', { id }, { token: players[0].token })).status).toBe(401)
  expect((await live('command', {}, { body: { id, command: 'finish' } })).status).toBe(401)
  // The real owner still can.
  expect((await hostState(teacher, id)).game.code).toBe(code)
})

test('security: a player token only ever reaches its own game and seat', async () => {
  const one = await setup(['Alpha'])
  const two = await setup(['Beta'])
  await command(one.teacher, one.id, 'start')
  await command(two.teacher, two.id, 'start')
  const a = await playerState(one.players[0].token)
  expect(a.body.me?.nickname).toBe('Alpha')
  expect(a.body.game.id).toBe(one.id)
  // The token cannot be used as a teacher, cannot answer another game's question index differently, and a made-up token is refused.
  expect((await live('command', {}, { token: one.players[0].token, body: { id: two.id, command: 'finish' } })).status).toBe(401)
  expect((await playerState('x'.repeat(40))).status).toBe(401)
  expect((await live('state', {}, { playerToken: 'x'.repeat(500) })).status).toBe(401)
  // Alpha's answer lands on Alpha in game one, never on Beta in game two.
  await answer(one.players[0].token, 0, [1])
  const { data } = await admin.from('live_answers').select('game_id').eq('game_id', two.id)
  expect(data).toEqual([])
})

test('security: guessing codes is rate limited per address, and good codes from a quiet address still work', async () => {
  const { code } = await setup(['Ayse'])
  const noisy = '203.0.113.77'
  const statuses: number[] = []
  for (let i = 0; i < 23; i += 1) statuses.push((await joinGame('999999', 'Guess', { ip: noisy })).status)
  expect(statuses.slice(0, 20).every((status) => status === 404)).toBe(true)
  expect(statuses.slice(20)).toEqual([429, 429, 429])
  // Even the right code is refused for the guesser's address for now...
  expect((await joinGame(code, 'Guess', { ip: noisy })).status).toBe(429)
  // ...while a classroom sharing another address joins freely, many students in a row.
  const classroom = '198.51.100.9'
  for (let i = 0; i < 25; i += 1) expect((await joinGame(code, `Kid${i}`, { ip: classroom })).status, `kid ${i}`).toBe(200)
})

test('privacy: cleanup deletes players and answers of games finished 30+ days ago, keeps the aggregates, and ends idle games', async () => {
  const { teacher, id, players } = await setup(['One', 'Two'])
  await command(teacher, id, 'start')
  await answer(players[0].token, 0, [1])
  await command(teacher, id, 'finish')
  const summaryBefore = (await admin.from('live_games').select('summary').eq('id', id).single()).data!.summary
  const old = new Date(Date.now() - 31 * 86_400_000).toISOString()
  await admin.from('live_games').update({ finished_at: old, last_activity_at: old }).eq('id', id)
  const recent = await setup(['Keep'])
  await command(recent.teacher, recent.id, 'start')
  await answer(recent.players[0].token, 0, [1])
  await command(recent.teacher, recent.id, 'finish')
  const idle = await setup(['Idle'])
  await admin.from('live_games').update({ last_activity_at: new Date(Date.now() - 40 * 60_000).toISOString() }).eq('id', idle.id)

  expect((await live('cleanup')).status).toBe(401)
  expect((await live('cleanup', {}, { token: 'nope' })).status).toBe(401)
  const run = await fetchCleanup()
  expect(run.status).toBe(200)

  expect((await admin.from('live_players').select('id').eq('game_id', id)).data).toEqual([])
  expect((await admin.from('live_answers').select('id').eq('game_id', id)).data).toEqual([])
  const game = (await admin.from('live_games').select('summary, ranking_purged_at').eq('id', id).single()).data!
  expect(game.summary).toEqual(summaryBefore)
  expect(game.ranking_purged_at).not.toBeNull()
  const results = await live<{ rankingPurged: boolean; ranking: unknown; summary: { playerCount: number } }>('results', { id }, { token: teacher.accessToken })
  expect(results.body).toMatchObject({ rankingPurged: true, ranking: null })
  expect(results.body.summary.playerCount).toBe(2)
  // Recent finished games keep their players; the idle game ended.
  expect((await admin.from('live_players').select('id').eq('game_id', recent.id)).data).toHaveLength(1)
  expect((await admin.from('live_games').select('state').eq('id', idle.id).single()).data!.state).toBe('ended')
})

async function fetchCleanup() {
  const response = await fetch(`http://localhost:5192/api/live?action=cleanup`, { headers: { authorization: `Bearer ${CRON_SECRET}` } })
  return { status: response.status, body: await response.json() }
}
