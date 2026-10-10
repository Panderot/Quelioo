import { canonicalRedirectTarget, resolvePublicSiteUrl } from './publicSiteCore'

const env = import.meta.env as ImportMetaEnv | undefined

/** The address people should use to reach the app: the QR code, join address, share links, auth redirects. */
export function getPublicSiteUrl(): string {
  return resolvePublicSiteUrl({ prod: env?.PROD === true, override: env?.VITE_PUBLIC_SITE_URL, origin: window.location.origin })
}

/** Production only: a protected deployment-specific *.vercel.app address moves to the canonical one. True when it redirects. */
export function redirectToCanonicalSite(): boolean {
  if (env?.PROD !== true) return false
  const { hostname, pathname, search, hash } = window.location
  const target = canonicalRedirectTarget({ hostname, pathname, search, hash, siteUrl: getPublicSiteUrl() })
  if (!target) return false
  window.location.replace(target)
  return true
}
