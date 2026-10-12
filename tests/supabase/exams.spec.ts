import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

import type { Database } from '../../src/lib/database.types'
import { testEnv } from './env'
import { cleanupTestUsers, createTestUser } from './helpers'
import type { TestUser } from './helpers'

// Written exams on the TEST project: owner CRUD, the conditional (two-tab) update, and Row Level
// Security attacks by another user and by an anonymous visitor.

test.describe.configure({ mode: 'serial' })

let a: TestUser
let b: TestUser

const examId = crypto.randomUUID()
const settings = { header: { course: 'Tarih', grade: '9' }, counts: { mcq: 1 } }
const questions = [{ id: 'q1', type: 'mcq', stem: 'Soru?', options: ['a', 'b'], answerIndex: 0, answer: 'a', rubric: [], points: 100, topic: 't', difficulty: 'easy', lines: 0 }]

test.beforeAll(async () => {
  a = await createTestUser('exam-a')
  b = await createTestUser('exam-b')
})

test.afterAll(async () => {
  await cleanupTestUsers()
})

test.describe('written_exams', () => {
  test('owner creates, reads, updates and counts questions', async () => {
    const insert = await a.client.from('written_exams').insert({ id: examId, title: 'A exam', settings, questions }).select('user_id, question_count, updated_at').single()
    expect(insert.error).toBeNull()
    expect(insert.data?.user_id).toBe(a.id)
    expect(insert.data?.question_count).toBe(1)

    const read = await a.client.from('written_exams').select('title, source_text').eq('id', examId).single()
    expect(read.data).toEqual({ title: 'A exam', source_text: '' })

    const update = await a.client.from('written_exams').update({ title: 'A exam v2' }).eq('id', examId).select('title')
    expect(update.data).toEqual([{ title: 'A exam v2' }])
  })

  test('conditional update: a stale updated_at changes nothing', async () => {
    const { data: current } = await a.client.from('written_exams').select('updated_at').eq('id', examId).single()
    const stale = '2000-01-01T00:00:00+00:00'
    const refused = await a.client.from('written_exams').update({ title: 'stale' }).eq('id', examId).eq('updated_at', stale).select('updated_at')
    expect(refused.error).toBeNull()
    expect(refused.data).toEqual([])

    const accepted = await a.client.from('written_exams').update({ title: 'fresh' }).eq('id', examId).eq('updated_at', current!.updated_at).select('updated_at')
    expect(accepted.data).toHaveLength(1)
    expect(accepted.data![0].updated_at).not.toBe(current!.updated_at)

    // The old value no longer matches: the second tab's save is refused.
    const again = await a.client.from('written_exams').update({ title: 'second tab' }).eq('id', examId).eq('updated_at', current!.updated_at).select('updated_at')
    expect(again.data).toEqual([])
    const check = await a.client.from('written_exams').select('title').eq('id', examId).single()
    expect(check.data?.title).toBe('fresh')
  })

  test('rejects questions that are not an array and generated column writes', async () => {
    const notArray = await a.client.from('written_exams').insert({ title: 'bad', settings, questions: { a: 1 } })
    expect(notArray.error).not.toBeNull()
    const generated = await a.client.from('written_exams').insert({ title: 'bad', settings, questions, question_count: 9 } as never)
    expect(generated.error).not.toBeNull()
  })

  test('B cannot read, update, delete or insert as A', async () => {
    const read = await b.client.from('written_exams').select('id').eq('id', examId)
    expect(read.error).toBeNull()
    expect(read.data).toEqual([])

    const update = await b.client.from('written_exams').update({ title: 'hacked' }).eq('id', examId).select('id')
    expect(update.data ?? []).toEqual([])
    const remove = await b.client.from('written_exams').delete().eq('id', examId).select('id')
    expect(remove.data ?? []).toEqual([])

    const forged = await b.client.from('written_exams').insert({ user_id: a.id, title: 'forged', settings, questions })
    expect(forged.error).not.toBeNull()
    const takeover = await b.client.from('written_exams').update({ user_id: b.id }).eq('id', examId).select('id')
    expect(takeover.data ?? []).toEqual([])

    const { data } = await a.client.from('written_exams').select('title, user_id').eq('id', examId).single()
    expect(data).toEqual({ title: 'fresh', user_id: a.id })
  })

  test('anonymous visitors see and write nothing', async () => {
    const anon = createClient<Database>(testEnv.url, testEnv.publishableKey, { auth: { persistSession: false } })
    const { data } = await anon.from('written_exams').select('*')
    expect(data ?? []).toEqual([])
    expect((await anon.from('written_exams').insert({ title: 'anon', settings, questions })).error).not.toBeNull()
    expect((await anon.from('exam_settings').insert({ header: {} })).error).not.toBeNull()
  })

  test('owner deletes the exam', async () => {
    const remove = await a.client.from('written_exams').delete().eq('id', examId).select('id')
    expect(remove.data).toEqual([{ id: examId }])
  })
})

test.describe('exam_settings', () => {
  test('one header row per user, private to the owner', async () => {
    const first = await a.client.from('exam_settings').upsert({ user_id: a.id, header: { school: 'A okulu' } }, { onConflict: 'user_id' })
    expect(first.error).toBeNull()
    const second = await a.client.from('exam_settings').upsert({ user_id: a.id, header: { school: 'A okulu 2' } }, { onConflict: 'user_id' })
    expect(second.error).toBeNull()
    const mine = await a.client.from('exam_settings').select('header')
    expect(mine.data).toEqual([{ header: { school: 'A okulu 2' } }])

    const theirs = await b.client.from('exam_settings').select('header').eq('user_id', a.id)
    expect(theirs.data).toEqual([])
    const forged = await b.client.from('exam_settings').upsert({ user_id: a.id, header: { school: 'hacked' } }, { onConflict: 'user_id' })
    expect(forged.error).not.toBeNull()
    const overwrite = await b.client.from('exam_settings').update({ header: { school: 'hacked' } }).eq('user_id', a.id).select('user_id')
    expect(overwrite.data ?? []).toEqual([])
    const { data } = await a.client.from('exam_settings').select('header')
    expect(data).toEqual([{ header: { school: 'A okulu 2' } }])
  })
})
