export interface FocusPart {
  id: string
  start: number
  end: number
}

export const MAX_FOCUS_PARTS = 5
const MAX_FOCUS_SNIPPET_CHARS = 500

function makeId(): string {
  return `focus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Merges a new [start,end) range into the existing list, combining it with any range it overlaps
 * or touches into a single part (spec: "Overlapping selections merge into one"). Returns the
 * unchanged list, capped, when already at MAX_FOCUS_PARTS and the new range doesn't merge into an
 * existing one. */
export function addFocusRange(parts: FocusPart[], start: number, end: number): FocusPart[] {
  if (start >= end) return parts
  const overlapping = parts.filter((part) => start <= part.end && end >= part.start)
  const nonOverlapping = parts.filter((part) => !(start <= part.end && end >= part.start))

  if (overlapping.length === 0 && parts.length >= MAX_FOCUS_PARTS) return parts

  const mergedStart = Math.min(start, ...overlapping.map((part) => part.start))
  const mergedEnd = Math.max(end, ...overlapping.map((part) => part.end))
  const id = overlapping[0]?.id ?? makeId()
  const merged: FocusPart = { id, start: mergedStart, end: mergedEnd }

  return [...nonOverlapping, merged].sort((a, b) => a.start - b.start)
}

export function removeFocusPart(parts: FocusPart[], id: string): FocusPart[] {
  return parts.filter((part) => part.id !== id)
}

/** Extracts the current snippet text for a part from the live source text, capped at the server's
 * per-snippet character limit. */
function focusPartText(text: string, part: FocusPart): string {
  return text.slice(part.start, part.end).slice(0, MAX_FOCUS_SNIPPET_CHARS)
}

/** Short chip preview — first few words of the part's text, with an ellipsis if truncated. */
export function focusPartPreview(text: string, part: FocusPart, maxWords = 6): string {
  const words = focusPartText(text, part).trim().split(/\s+/).filter(Boolean)
  const preview = words.slice(0, maxWords).join(' ')
  return words.length > maxWords ? `${preview}…` : preview
}

/**
 * Re-locates focus parts after the textarea content changes: parts entirely before or after the
 * single edited region shift with it (so typing elsewhere in the text never disturbs existing
 * focus marks); a part that overlaps the edited region no longer points at the same text, so it's
 * dropped. Uses a common-prefix/common-suffix diff, which exactly captures a single textarea edit
 * (typing, pasting, or deleting a selection).
 */
export function reconcileFocusParts(parts: FocusPart[], oldText: string, newText: string): { parts: FocusPart[]; removedCount: number } {
  if (parts.length === 0 || oldText === newText) return { parts, removedCount: 0 }

  const maxPrefix = Math.min(oldText.length, newText.length)
  let prefix = 0
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++

  const maxSuffix = maxPrefix - prefix
  let suffix = 0
  while (suffix < maxSuffix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++

  const oldEditEnd = oldText.length - suffix
  const delta = newText.length - oldText.length

  const kept: FocusPart[] = []
  let removedCount = 0
  for (const part of parts) {
    if (part.end <= prefix) {
      kept.push(part)
    } else if (part.start >= oldEditEnd) {
      kept.push({ ...part, start: part.start + delta, end: part.end + delta })
    } else {
      removedCount++
    }
  }
  return { parts: kept, removedCount }
}

export function focusSnippetsFor(text: string, parts: FocusPart[]): string[] {
  return parts.map((part) => focusPartText(text, part)).filter((snippet) => snippet.trim().length > 0)
}
