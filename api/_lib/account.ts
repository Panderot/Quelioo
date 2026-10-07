import type { IncomingMessage, ServerResponse } from 'node:http'

import { readRequestBody } from './anthropic.js'
import { authenticateStrict } from './auth.js'
import type { AuthenticatedUser } from './auth.js'
import { getServiceClient, isServiceConfigured } from './supabase-server.js'
import { createUserRateLimit } from './user-rate-limit.js'

/** /api/account: the three things that need the server's secret key — a full export of the account's
 * data, deleting the account with every row and file, and the owner's usage summary. Every query made
 * with the secret key filters by the verified caller's own user id. */

const limiter = createUserRateLimit(10)
const MAX_BODY_BYTES = 4096
const BUCKETS = ['audio', 'uploads'] as const
const EXPORT_LINK_SECONDS = 24 * 60 * 60

type Body = Record<string, unknown>

const USER_TABLES = ['decks', 'cards', 'card_progress', 'quizzes', 'solves', 'songs', 'lessons', 'lesson_plans', 'lesson_segments', 'usage_events'] as const
type UserTable = (typeof USER_TABLES)[number]

function respond(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Every object under "<user id>/" of a bucket (folders are walked). */
async function listObjects(bucket: (typeof BUCKETS)[number], prefix: string): Promise<string[]> {
  const storage = getServiceClient().storage.from(bucket)
  const paths: string[] = []
  const walk = async (folder: string): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(folder, { limit: 1000, offset })
      if (error || !data) throw new Error('storage list failed')
      for (const entry of data) {
        const path = `${folder}/${entry.name}`
        if (entry.id === null) await walk(path)
        else paths.push(path)
      }
      if (data.length < 1000) break
    }
  }
  await walk(prefix)
  return paths
}

async function selectAll(table: UserTable, userId: string): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getServiceClient().from(table).select('*').eq('user_id', userId).range(from, from + 999)
    if (error) throw new Error(`select ${table} failed`)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

async function exportData(user: AuthenticatedUser): Promise<Body> {
  const client = getServiceClient()
  const [profile, subscription] = await Promise.all([
    client.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    client.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
  ])
  const tables: Body = {}
  for (const table of USER_TABLES) tables[table] = await selectAll(table, user.id)
  const files: { bucket: string; path: string; url: string | null }[] = []
  for (const bucket of BUCKETS) {
    const paths = await listObjects(bucket, user.id)
    for (let index = 0; index < paths.length; index += 100) {
      const chunk = paths.slice(index, index + 100)
      const { data } = await client.storage.from(bucket).createSignedUrls(chunk, EXPORT_LINK_SECONDS)
      const byPath = new Map((data ?? []).map((entry) => [entry.path, entry.signedUrl]))
      for (const path of chunk) files.push({ bucket, path, url: byPath.get(path) ?? null })
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    note: 'Files (audio, images) are listed with download links that work for 24 hours.',
    account: { id: user.id, email: user.email },
    profile: profile.data ?? null,
    subscription: subscription.data ?? null,
    ...tables,
    files,
  }
}

async function deleteAccount(user: AuthenticatedUser): Promise<void> {
  const client = getServiceClient()
  for (const bucket of BUCKETS) {
    const paths = await listObjects(bucket, user.id)
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 100))
      if (error) throw new Error('storage remove failed')
    }
  }
  // Every table references the auth user with ON DELETE CASCADE, so rows go with it.
  const { error } = await client.auth.admin.deleteUser(user.id)
  if (error) throw new Error('delete user failed')
}

async function usageSummary(): Promise<Body> {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const totals = new Map<string, { costUsd: number; count: number }>()
  let totalUsd = 0
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getServiceClient()
      .from('usage_events')
      .select('feature, cost_usd')
      .gte('created_at', start.toISOString())
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error('usage select failed')
    for (const row of data) {
      const entry = totals.get(row.feature) ?? { costUsd: 0, count: 0 }
      entry.costUsd += Number(row.cost_usd)
      entry.count += 1
      totals.set(row.feature, entry)
      totalUsd += Number(row.cost_usd)
    }
    if (data.length < 1000) break
  }
  return {
    month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
    totalUsd: Math.round(totalUsd * 100000) / 100000,
    byFeature: [...totals.entries()].map(([feature, value]) => ({ feature, costUsd: Math.round(value.costUsd * 100000) / 100000, count: value.count })).sort((a, b) => b.costUsd - a.costUsd),
  }
}

export async function accountRequestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    respond(res, 405, { error: 'bad_request' })
    return
  }
  const auth = await authenticateStrict(req)
  if (auth.status === 'unavailable' || !isServiceConfigured()) {
    respond(res, 503, { error: 'server' })
    return
  }
  if (auth.status !== 'ok') {
    respond(res, 401, { error: 'unauthorized' })
    return
  }
  if (!limiter.take(auth.user.id)) {
    respond(res, 429, { error: 'rate_limited' })
    return
  }

  let body: Body
  try {
    const parsed: unknown = JSON.parse(await readRequestBody(req, MAX_BODY_BYTES))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape')
    body = parsed as Body
  } catch {
    respond(res, 400, { error: 'bad_request' })
    return
  }

  try {
    if (body.action === 'export') {
      respond(res, 200, await exportData(auth.user))
      return
    }
    if (body.action === 'delete') {
      const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : ''
      if (!auth.user.email || confirm !== auth.user.email.toLowerCase()) {
        respond(res, 400, { error: 'bad_request' })
        return
      }
      await deleteAccount(auth.user)
      respond(res, 200, { ok: true })
      return
    }
    if (body.action === 'usage') {
      const { data } = await getServiceClient().from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
      if (data?.role !== 'admin') {
        respond(res, 403, { error: 'forbidden' })
        return
      }
      respond(res, 200, await usageSummary())
      return
    }
    respond(res, 400, { error: 'bad_request' })
  } catch (error) {
    // One line, no user data: which step failed.
    console.error(`account: action=${String(body.action)} failed=${error instanceof Error ? error.message : 'unknown'}`)
    respond(res, 500, { error: 'server' })
  }
}
