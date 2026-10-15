export interface TextSegment {
  type: 'text'
  value: string
}

export interface MathSegment {
  type: 'math'
  value: string
  block: boolean
  // Suffix or closing punctuation written right after an inline formula ("'dır.", ",", ")").
  // It renders with the formula so a line break never separates them.
  trailing?: string
}

// Matches $$block$$ before $inline$ so block math isn't split into two inline matches.
const MATH_SEGMENT_REGEX = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
// Apostrophe suffix (' or ’ plus letters) and/or closing punctuation at the very start of the text.
const TRAILING_AFTER_INLINE_MATH = /^(?:['’]\p{L}+)?[.,;:!?)]*/u

export function splitMathSegments(text: string): (TextSegment | MathSegment)[] {
  const segments: (TextSegment | MathSegment)[] = []
  let lastIndex = 0
  const regex = new RegExp(MATH_SEGMENT_REGEX.source, 'g')

  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'math', value: match[1], block: true })
    } else if (match[2] !== undefined) {
      segments.push({ type: 'math', value: match[2], block: false })
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return attachTrailingToInlineMath(segments)
}

function attachTrailingToInlineMath(segments: (TextSegment | MathSegment)[]): (TextSegment | MathSegment)[] {
  const result: (TextSegment | MathSegment)[] = []
  for (const segment of segments) {
    const previous = result[result.length - 1]
    if (segment.type === 'text' && previous?.type === 'math' && !previous.block) {
      const lead = TRAILING_AFTER_INLINE_MATH.exec(segment.value)?.[0] ?? ''
      if (lead.length > 0) {
        previous.trailing = lead
        const rest = segment.value.slice(lead.length)
        if (rest.length > 0) result.push({ type: 'text', value: rest })
        continue
      }
    }
    result.push(segment)
  }
  return result
}
