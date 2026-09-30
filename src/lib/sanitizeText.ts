import { MAX_SOURCE_TEXT_CHARS } from './textStats.js'

export interface SanitizedText {
  text: string
  truncated: boolean
}

/**
 * Strips null/control characters (keeping newlines and tabs), normalizes line endings, and
 * collapses excessive blank lines — without touching length. Never throws. Safe to run on every
 * keystroke/paste (e.g. in a live textarea) since it never silently truncates what the user typed.
 */
export function sanitizeTextLight(input: string): string {
  if (typeof input !== 'string') return ''
  return input
    // eslint-disable-next-line no-control-regex -- intentionally stripping C0/C1 control chars, keeping \n (0x0A) and \t (0x09)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
}

/**
 * Shared client+server sanitizer for source text right before it's sent to the API: applies the
 * light sanitize above and caps length at MAX_SOURCE_TEXT_CHARS. Never throws — used on arbitrary
 * user input (pasted text, files, fetched pages) that may contain emoji, RTL/CJK text, zero-width
 * characters, or huge unbroken strings.
 */
export function sanitizeSourceText(input: string): SanitizedText {
  const stripped = sanitizeTextLight(input)
  const truncated = stripped.length > MAX_SOURCE_TEXT_CHARS
  return { text: truncated ? stripped.slice(0, MAX_SOURCE_TEXT_CHARS) : stripped, truncated }
}

/**
 * Prompt-injection hardening: neutralizes any occurrence of the <source_text>/</source_text>
 * wrapper tags (or tag-like fragments of them) inside user-provided text, so it can never be
 * used to break out of the DATA wrapper the generate prompt puts it in. Applied server-side,
 * right before the text is embedded between the real wrapper tags.
 */
export function neutralizeSourceTextTags(text: string): string {
  return neutralizeTag(text, 'source_text')
}

/**
 * Same prompt-injection hardening as neutralizeSourceTextTags, generalized to any wrapper tag
 * name — used wherever untrusted user text (source text, a student's answer) is embedded inside
 * an XML-ish tag in a prompt, so it can never fake its way out of that tag.
 */
export function neutralizeTag(text: string, tagName: string): string {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .replace(new RegExp(`<(\\/?)\\s*${escaped}\\b([^>]*)>`, 'gi'), (_match, slash: string, attrs: string) => `‹${slash}${tagName}${attrs}›`)
    .replace(new RegExp(`<(\\/?)\\s*${escaped}\\b`, 'gi'), (_match, slash: string) => `‹${slash}${tagName}`)
    .replace(new RegExp(`${escaped}\\s*>`, 'gi'), (match) => match.replace('>', '›'))
}
