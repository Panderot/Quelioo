import type { IncomingMessage, ServerResponse } from 'node:http'
import * as http from 'node:http'
import * as https from 'node:https'
import type { LookupFunction } from 'node:net'
import { lookup as dnsLookup } from 'node:dns'
import type { LookupOptions } from 'node:dns'

import { isRecord, readRequestBody } from './anthropic.js'
import { isPublicIp, validateFetchUrl } from './ssrf.js'
import { countWords } from '../../src/lib/textStats.js'

export type ExtractUrlErrorCode =
  | 'invalid_url'
  | 'blocked_address'
  | 'unreachable'
  | 'timeout'
  | 'not_html'
  | 'no_readable_text'
  | 'youtube_not_supported'
  | 'too_many_redirects'

export interface ExtractUrlSuccessBody {
  title: string
  text: string
  wordCount: number
  truncated: boolean
}

export interface ExtractUrlErrorBody {
  error: ExtractUrlErrorCode
}

const MAX_REQUEST_BYTES = 8 * 1024
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8000
const MAX_REDIRECTS = 3
const USER_AGENT = 'QuelioBot/1.0 (+https://quelio.app)'
const TRUNCATE_TO_WORDS = 5000

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'])

function isYoutubeUrl(url: URL): boolean {
  return YOUTUBE_HOSTS.has(url.hostname.toLowerCase())
}

/** Custom DNS lookup used for every request (including each redirect hop) so the IP is
 * validated at connection time, not just when the URL string was first parsed — this is what
 * stops DNS-rebinding attacks (resolve-to-public-then-swap-to-private between check and connect).
 * Node's own http/net layer calls this with `options.all: true` when it wants every resolved
 * address (Happy Eyeballs dual-stack), and with a single-result shape otherwise — the callback
 * must honor whichever form was requested or Node throws ERR_INVALID_IP_ADDRESS internally. */
const safeLookup: LookupFunction = (hostname, options: LookupOptions, callback) => {
  const wantsAll = options.all === true

  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, wantsAll ? [] : '', 4)
      return
    }
    const valid = addresses.filter((entry) => isPublicIp(entry.address))
    if (valid.length === 0) {
      callback(new Error('blocked_address') as NodeJS.ErrnoException, wantsAll ? [] : '', 4)
      return
    }
    if (wantsAll) {
      callback(null, valid, valid[0].family)
    } else {
      callback(null, valid[0].address, valid[0].family)
    }
  })
}

interface FetchOutcome {
  ok: boolean
  error?: ExtractUrlErrorCode
  body?: string
  contentType?: string
}

function fetchOneHop(url: URL, deadline: number): Promise<FetchOutcome> {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      resolve({ ok: false, error: 'timeout' })
      return
    }

    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '80'),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        lookup: safeLookup,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        },
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve({ ok: false, error: undefined, body: `redirect:${res.headers.location}` })
          return
        }

        if (status < 200 || status >= 300) {
          res.resume()
          resolve({ ok: false, error: 'unreachable' })
          return
        }

        const contentType = (res.headers['content-type'] ?? '').toLowerCase()
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
          res.resume()
          resolve({ ok: false, error: 'not_html' })
          return
        }

        const chunks: Buffer[] = []
        let total = 0
        res.on('data', (chunk: Buffer) => {
          total += chunk.length
          if (total > MAX_RESPONSE_BYTES) {
            chunks.push(chunk.subarray(0, Math.max(0, MAX_RESPONSE_BYTES - (total - chunk.length))))
            res.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ ok: true, body: Buffer.concat(chunks).toString('utf8'), contentType }))
        res.on('error', () => resolve({ ok: false, error: 'unreachable' }))
      },
    )

    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, error: 'timeout' })
    })
    req.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ ok: false, error: err.message === 'blocked_address' ? 'blocked_address' : 'unreachable' })
    })
    req.end()
  })
}

async function fetchWithRedirects(startUrl: URL): Promise<{ ok: true; html: string } | { ok: false; error: ExtractUrlErrorCode }> {
  const deadline = Date.now() + FETCH_TIMEOUT_MS
  let currentUrl = startUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const outcome = await fetchOneHop(currentUrl, deadline)

    if (outcome.body?.startsWith('redirect:')) {
      if (hop === MAX_REDIRECTS) return { ok: false, error: 'too_many_redirects' }
      const location = outcome.body.slice('redirect:'.length)
      let nextUrl: URL
      try {
        nextUrl = new URL(location, currentUrl)
      } catch {
        return { ok: false, error: 'unreachable' }
      }
      const revalidated = validateFetchUrl(nextUrl.toString())
      if (!revalidated.ok) return { ok: false, error: revalidated.error }
      currentUrl = revalidated.url
      continue
    }

    if (!outcome.ok) return { ok: false, error: outcome.error ?? 'unreachable' }
    return { ok: true, html: outcome.body ?? '' }
  }

  return { ok: false, error: 'too_many_redirects' }
}

async function extractArticle(html: string): Promise<{ title: string; text: string } | null> {
  const [{ Readability }, { parseHTML }] = await Promise.all([import('@mozilla/readability'), import('linkedom')])
  try {
    const { document } = parseHTML(html)
    // linkedom's Document is structurally compatible with the DOM Document Readability expects,
    // but the api/ program has no "dom" lib — cast through any rather than pull it in just for this.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const article = new Readability(document as any).parse()
    const text = article?.textContent?.trim() ?? ''
    if (!text) return null
    return { title: article?.title?.trim() ?? '', text }
  } catch {
    return null
  }
}

async function handleExtractUrlRequest(payload: unknown): Promise<{ status: number; body: ExtractUrlSuccessBody | ExtractUrlErrorBody }> {
  if (!isRecord(payload) || typeof payload.url !== 'string' || !payload.url.trim()) {
    return { status: 400, body: { error: 'invalid_url' } }
  }

  const validated = validateFetchUrl(payload.url.trim())
  if (!validated.ok) return { status: 400, body: { error: validated.error } }

  if (isYoutubeUrl(validated.url)) {
    return { status: 400, body: { error: 'youtube_not_supported' } }
  }

  let fetched: Awaited<ReturnType<typeof fetchWithRedirects>>
  try {
    fetched = await fetchWithRedirects(validated.url)
  } catch {
    fetched = { ok: false, error: 'unreachable' }
  }
  if (!fetched.ok) {
    const status = fetched.error === 'timeout' ? 504 : fetched.error === 'blocked_address' ? 400 : 502
    return { status, body: { error: fetched.error } }
  }

  const article = await extractArticle(fetched.html)
  if (!article || countWords(article.text) < 1) {
    return { status: 422, body: { error: 'no_readable_text' } }
  }

  const rawWordCount = countWords(article.text)
  let text = article.text
  let truncated = false
  if (rawWordCount > TRUNCATE_TO_WORDS) {
    const words = text.split(/\s+/)
    text = words.slice(0, TRUNCATE_TO_WORDS).join(' ')
    truncated = true
  }

  return {
    status: 200,
    body: { title: article.title, text, wordCount: countWords(text), truncated },
  }
}

export async function extractUrlRequestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const respond = (status: number, body: ExtractUrlSuccessBody | ExtractUrlErrorBody) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'POST') {
    respond(405, { error: 'invalid_url' })
    return
  }

  let rawBody: string
  try {
    rawBody = await readRequestBody(req, MAX_REQUEST_BYTES)
  } catch {
    respond(400, { error: 'invalid_url' })
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    respond(400, { error: 'invalid_url' })
    return
  }

  const { status, body } = await handleExtractUrlRequest(payload)
  respond(status, body)
}
