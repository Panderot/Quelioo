/** Pure rules for the public site address (kept free of import.meta so unit specs can import it). */

export const CANONICAL_SITE_URL = 'https://quelio.vercel.app'

export interface PublicSiteInput {
  /** Production build (import.meta.env.PROD). */
  prod: boolean
  /** Optional override (VITE_PUBLIC_SITE_URL), e.g. a custom domain. */
  override?: string
  /** The page's current origin. */
  origin: string
}

function cleanUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

/** Production: always the canonical address (or the override). Development and tests: the current origin. */
export function resolvePublicSiteUrl({ prod, override, origin }: PublicSiteInput): string {
  if (!prod) return origin
  return cleanUrl(override) ?? CANONICAL_SITE_URL
}

export interface RedirectInput {
  hostname: string
  pathname: string
  search: string
  hash: string
  /** The canonical address (see resolvePublicSiteUrl). */
  siteUrl: string
}

/** Deployment hosts of this project: quelio-<hash>-<team>.vercel.app, quelio-git-<branch>-<team>.vercel.app. */
const PROJECT_HOST = /^quelio(-[a-z0-9-]+)?\.vercel\.app$/i

/** The URL to send the page to, or null to stay. Never touches /api, version.json or static files. */
export function canonicalRedirectTarget({ hostname, pathname, search, hash, siteUrl }: RedirectInput): string | null {
  const canonicalHost = new URL(siteUrl).hostname
  const host = hostname.toLowerCase()
  if (host === canonicalHost || !PROJECT_HOST.test(host)) return null
  if (pathname === '/api' || pathname.startsWith('/api/')) return null
  if (pathname === '/version.json' || /\.[a-z0-9]{1,8}$/i.test(pathname)) return null
  return `${siteUrl}${pathname}${search}${hash}`
}
