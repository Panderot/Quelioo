/**
 * Firefox and Safari (every iOS browser is WebKit) ignore the page-margin boxes that carry
 * "Sayfa 1 / 3" in the print view; Chromium browsers (Chrome, Edge, Opera, Brave) draw them.
 */
export function lacksPrintPageNumbers(userAgent: string): boolean {
  if (/\b(Firefox|FxiOS)\//.test(userAgent)) return true
  if (/\b(CriOS|EdgiOS|OPiOS)\//.test(userAgent)) return true
  if (/\b(Chrome|Chromium|Edg|OPR)\//.test(userAgent)) return false
  return /\bSafari\//.test(userAgent)
}
