import { isIP } from 'node:net'

/** Returns true if an IPv4 address (as a 4-tuple) falls in a private/reserved/loopback/link-local range. */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local, incl. 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 0 && octets[2] === 0) return true // 192.0.0.0/24
  if (a === 192 && b === 0 && octets[2] === 2) return true // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 88 && octets[2] === 99) return true // 192.88.99.0/24 (6to4 relay)
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 (benchmark)
  if (a === 198 && b === 51 && octets[2] === 100) return true // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && octets[2] === 113) return true // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  return false
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => Number.parseInt(part, 10))
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  return octets
}

/** Parses a full IPv6 address (no zone id, no embedded IPv4 shorthand already expanded by Node) into 8 16-bit groups. */
function parseIpv6Groups(address: string): number[] | null {
  const withoutZone = address.split('%')[0]
  const halves = withoutZone.split('::')
  if (halves.length > 2) return null

  const parseGroupList = (part: string): number[] => (part === '' ? [] : part.split(':').map((g) => Number.parseInt(g, 16)))

  let head: number[]
  let tail: number[]
  if (halves.length === 2) {
    head = parseGroupList(halves[0])
    tail = parseGroupList(halves[1])
  } else {
    head = parseGroupList(halves[0])
    tail = []
  }

  // An embedded IPv4 tail (e.g. "::ffff:127.0.0.1") appears as a dotted quad in the last segment.
  const expand = (groups: number[], rawPart: string): number[] => {
    if (!rawPart.includes('.')) return groups
    const segments = rawPart.split(':')
    const v4 = segments.pop() as string
    const octets = parseIpv4(v4)
    if (!octets) return groups
    const asGroups = [octets[0] * 256 + octets[1], octets[2] * 256 + octets[3]]
    const prefixGroups = segments.filter(Boolean).map((g) => Number.parseInt(g, 16))
    return [...prefixGroups, ...asGroups]
  }

  head = expand(head, halves[0])
  tail = halves.length === 2 ? expand(tail, halves[1]) : tail

  if (head.some((n) => Number.isNaN(n)) || tail.some((n) => Number.isNaN(n))) return null

  const missing = 8 - head.length - tail.length
  if (halves.length === 2) {
    if (missing < 0) return null
    return [...head, ...new Array(missing).fill(0), ...tail]
  }
  return head.length === 8 ? head : null
}

function isPrivateIpv6(groups: number[]): boolean {
  const [g0, g1] = groups
  if (groups.every((g) => g === 0)) return true // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true // ::1 loopback
  if ((g0 & 0xffe0) === 0xfe80) return true // fe80::/10 link-local
  if ((g0 & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g0 & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true // 2001:db8::/32 documentation
  if (g0 === 0x64 && g1 === 0xff9b && groups.slice(2, 7).every((g) => g === 0)) {
    // 64:ff9b::/96 NAT64 — check the embedded IPv4
    const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]
    return isPrivateIpv4(embedded)
  }
  if (groups.slice(0, 5).every((g) => g === 0) && (g0 === 0 ? groups[5] === 0xffff : false)) {
    // ::ffff:a.b.c.d IPv4-mapped — check the embedded IPv4
    const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]
    return isPrivateIpv4(embedded)
  }
  return false
}

/** True only for a public, routable address — used to validate every resolved IP (and IP-literal hosts) before connecting. */
export function isPublicIp(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const octets = parseIpv4(address)
    return octets !== null && !isPrivateIpv4(octets)
  }
  if (family === 6) {
    const groups = parseIpv6Groups(address)
    return groups !== null && !isPrivateIpv6(groups)
  }
  return false
}

export type UrlValidationError = 'invalid_url' | 'blocked_address'

export function validateFetchUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; error: UrlValidationError } {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, error: 'invalid_url' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'invalid_url' }

  const expectedPort = url.protocol === 'http:' ? '80' : '443'
  if (url.port !== '' && url.port !== expectedPort) return { ok: false, error: 'blocked_address' }

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return { ok: false, error: 'blocked_address' }

  // An IP-literal host is checked immediately; a DNS hostname is checked again at connection
  // time via the custom `lookup` passed to http(s).request, to defend against DNS rebinding.
  if (isIP(hostname) && !isPublicIp(hostname)) return { ok: false, error: 'blocked_address' }

  return { ok: true, url }
}
