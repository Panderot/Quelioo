import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

import type { Database } from '../../src/lib/database.types'
import { testEnv } from './env'
import { admin, cleanupTestUsers, createTestUser } from './helpers'
import type { TestUser } from './helpers'

// Row Level Security attacks with two real users on the TEST project: user B must not be able to
// read, change or delete anything of user A, change their own role, or write usage or subscriptions.

test.describe.configure({ mode: 'serial' })

let a: TestUser
let b: TestUser

const ids = {
  deck: crypto.randomUUID(),
  card: crypto.randomUUID(),
  quiz: crypto.randomUUID(),
  solve: crypto.randomUUID(),
}

/** Tables with an `id` column and one marker value each, to check nothing of A changed. */
const OWNED = [
  { table: 'decks', id: ids.deck, column: 'name', value: 'A deck' },
  { table: 'cards', id: ids.card, column: 'front', value: 'A front' },
  { table: 'quizzes', id: ids.quiz, column: 'title', value: 'A quiz' },
  { table: 'solves', id: ids.solve, column: 'language', value: 'auto' },
] as const

const imagePath = () => `${a.id}/solves/${ids.solve}.jpg`

test.beforeAll(async () => {
  a = await createTestUser('rls-a')
  b = await createTestUser('rls-b')
  const db = a.client
  const must = (result: { error: { message: string } | null }, what: string) => {
    if (result.error) throw new Error(`seed ${what}: ${result.error.message}`)
  }
  must(await db.from('decks').insert({ id: ids.deck, name: 'A deck' }), 'deck')
  must(await db.from('cards').insert({ id: ids.card, deck_id: ids.deck, front: 'A front', back: 'A back' }), 'card')
  must(await db.from('card_progress').insert({ card_id: ids.card, box: 3 }), 'progress')
  must(await db.from('quizzes').insert({ id: ids.quiz, title: 'A quiz', quiz: { questions: [{ question: 'Q?' }] } }), 'quiz')
  must(await db.from('solves').insert({ id: ids.solve, language: 'auto', result: { topic: 'A' }, thumbnail_path: imagePath() }), 'solve')
  must(await admin.from('usage_events').insert({ user_id: a.id, feature: 'generate', cost_usd: 0.01 }), 'usage')
  const image = await db.storage.from('uploads').upload(imagePath(), new Blob(['image-a'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
  must(image, 'image file')
})

test.afterAll(async () => {
  await cleanupTestUsers()
})

test.describe('database', () => {
  test('B reads none of the rows of A', async () => {
    for (const { table, id } of OWNED) {
      const { data, error } = await b.client.from(table).select('id').eq('id', id)
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
    for (const table of ['card_progress', 'usage_events', 'subscriptions'] as const) {
      const { data, error } = await b.client.from(table).select('*').eq('user_id', a.id)
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
    const profile = await b.client.from('profiles').select('*').eq('id', a.id)
    expect(profile.data).toEqual([])
  })

  test('B cannot see A even with no filter at all', async () => {
    for (const table of ['decks', 'cards', 'card_progress', 'quizzes', 'solves', 'usage_events', 'subscriptions', 'profiles'] as const) {
      const { data, error } = await b.client.from(table).select('*')
      expect(error, table).toBeNull()
      const foreign = (data ?? []).filter((row) => ('user_id' in row ? row.user_id === a.id : 'id' in row && row.id === a.id))
      expect(foreign, table).toEqual([])
    }
  })

  test('B cannot update any row of A', async () => {
    for (const { table, id, column } of OWNED) {
      const { data, error } = await b.client.from(table).update({ [column]: 'hacked' } as never).eq('id', id).select()
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
    const progress = await b.client.from('card_progress').update({ box: 5 }).eq('card_id', ids.card).select()
    expect(progress.data).toEqual([])
    const extras = await b.client.rpc('merge_solve_extras', { p_id: ids.solve, p_key: 'x', p_value: { hacked: true } })
    expect(extras.error).toBeNull()
  })

  test('B cannot delete any row of A', async () => {
    for (const { table, id } of OWNED) {
      const { data, error } = await b.client.from(table).delete().eq('id', id).select()
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
  })

  test('everything of A is still intact', async () => {
    for (const { table, id, column, value } of OWNED) {
      const { data } = await admin.from(table).select('*').eq('id', id).single()
      expect((data as Record<string, unknown>)[column], table).toBe(value)
    }
    const progress = await admin.from('card_progress').select('box').eq('card_id', ids.card).single()
    expect(progress.data?.box).toBe(3)
    const solve = await admin.from('solves').select('extras').eq('id', ids.solve).single()
    expect(solve.data?.extras).toEqual({})
  })

  test('B cannot insert rows as A, or attach rows to the deck of A', async () => {
    const asA = await b.client.from('decks').insert({ user_id: a.id, name: 'planted' })
    expect(asA.error).not.toBeNull()
    const quiz = await b.client.from('quizzes').insert({ user_id: a.id, title: 'planted', quiz: {} })
    expect(quiz.error).not.toBeNull()
    // A card of B pointing at A's deck: the (deck, owner) foreign key refuses it.
    const card = await b.client.from('cards').insert({ deck_id: ids.deck, front: 'x', back: 'y' })
    expect(card.error).not.toBeNull()
    const planted = await admin.from('decks').select('id').eq('name', 'planted')
    expect(planted.data).toEqual([])
  })

  test('B cannot change their own role, nor the role of A', async () => {
    const own = await b.client.from('profiles').update({ role: 'admin' }).eq('id', b.id).select()
    expect(own.error).not.toBeNull()
    const other = await b.client.from('profiles').update({ role: 'admin' }).eq('id', a.id).select()
    expect(other.data ?? []).toEqual([])
    const roles = await admin.from('profiles').select('id, role').in('id', [a.id, b.id])
    expect(roles.data?.every((row) => row.role === 'user')).toBe(true)
    // The allowed fields still work.
    const name = await b.client.from('profiles').update({ display_name: 'Bee', ui_language: 'tr' }).eq('id', b.id).select()
    expect(name.error).toBeNull()
    expect(name.data?.[0]?.display_name).toBe('Bee')
  })

  test('B cannot write usage_events or subscriptions', async () => {
    const insert = await b.client.from('usage_events').insert({ user_id: b.id, feature: 'forged', cost_usd: 0 })
    expect(insert.error).not.toBeNull()
    expect((await b.client.from('usage_events').update({ cost_usd: 0 }).eq('user_id', b.id)).error).not.toBeNull()
    expect((await b.client.from('usage_events').delete().eq('user_id', b.id)).error).not.toBeNull()
    expect((await b.client.from('subscriptions').insert({ user_id: b.id, plan: 'pro' })).error).not.toBeNull()
    expect((await b.client.from('subscriptions').update({ plan: 'pro' }).eq('user_id', b.id)).error).not.toBeNull()
    expect((await b.client.from('subscriptions').delete().eq('user_id', b.id)).error).not.toBeNull()
    const own = await admin.from('subscriptions').select('plan').eq('user_id', b.id).single()
    expect(own.data?.plan).toBe('free')
    expect((await admin.from('usage_events').select('id').eq('feature', 'forged')).data).toEqual([])
  })

  test('B reads only their own subscription, and A their own usage', async () => {
    const sub = await b.client.from('subscriptions').select('user_id, plan')
    expect(sub.data).toEqual([{ user_id: b.id, plan: 'free' }])
    const usage = await a.client.from('usage_events').select('feature, user_id')
    expect(usage.data).toEqual([{ feature: 'generate', user_id: a.id }])
  })

  test('a signed-out visitor reads nothing', async () => {
    const anon = createClient<Database>(testEnv.url, testEnv.publishableKey, { auth: { persistSession: false } })
    for (const table of ['profiles', 'decks', 'cards', 'quizzes', 'solves', 'usage_events', 'subscriptions'] as const) {
      const { data } = await anon.from(table).select('*')
      expect(data ?? [], table).toEqual([])
    }
    expect((await anon.from('decks').insert({ name: 'anon' })).error).not.toBeNull()
  })

  test('text columns have length limits', async () => {
    expect((await a.client.from('decks').insert({ name: 'x'.repeat(81) })).error).not.toBeNull()
    expect((await a.client.from('cards').insert({ deck_id: ids.deck, front: 'x'.repeat(301), back: 'b' })).error).not.toBeNull()
    expect((await a.client.from('quizzes').insert({ title: 'x'.repeat(301), quiz: {} })).error).not.toBeNull()
    expect((await a.client.from('profiles').update({ display_name: 'x'.repeat(81) }).eq('id', a.id)).error).not.toBeNull()
  })
})

test.describe('storage', () => {
  test('B cannot read, list, sign or download files of A', async () => {
    const listed = await b.client.storage.from('uploads').list(`${a.id}/solves`)
    expect(listed.data ?? []).toEqual([])
    const signed = await b.client.storage.from('uploads').createSignedUrl(imagePath(), 60)
    expect(signed.error).not.toBeNull()
    const image = await b.client.storage.from('uploads').download(imagePath())
    expect(image.error).not.toBeNull()
  })

  test('B cannot upload into, overwrite or delete files of A', async () => {
    const plant = await b.client.storage.from('uploads').upload(`${a.id}/solves/planted.jpg`, new Blob(['x'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    expect(plant.error).not.toBeNull()
    const overwrite = await b.client.storage.from('uploads').upload(imagePath(), new Blob(['hacked'], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: true })
    expect(overwrite.error).not.toBeNull()
    await b.client.storage.from('uploads').remove([imagePath()])
    const bytes = await admin.storage.from('uploads').download(imagePath())
    expect(await bytes.data?.text()).toBe('image-a')
  })

  test('each user can use their own folder, and the buckets are private', async () => {
    const own = await b.client.storage.from('uploads').upload(`${b.id}/solves/own.jpg`, new Blob(['b'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    expect(own.error).toBeNull()
    const signed = await b.client.storage.from('uploads').createSignedUrl(`${b.id}/solves/own.jpg`, 60)
    expect(signed.error).toBeNull()
    const response = await fetch(signed.data!.signedUrl)
    expect(response.status).toBe(200)
    // A bare public URL does not work: the bucket is private.
    const publicUrl = admin.storage.from('uploads').getPublicUrl(`${b.id}/solves/own.jpg`).data.publicUrl
    expect((await fetch(publicUrl)).status).toBeGreaterThanOrEqual(400)
    // Other file types are refused by the bucket.
    const html = await b.client.storage.from('uploads').upload(`${b.id}/solves/x.html`, new Blob(['<b>x</b>'], { type: 'text/html' }), { contentType: 'text/html' })
    expect(html.error).not.toBeNull()
  })
})
