import katex from 'katex'
import { useMemo } from 'react'

import { mathToPlainText } from '../lib/mathPlain'

interface MathTextProps {
  text: string
  className?: string
}

interface TextSegment {
  type: 'text'
  value: string
}

interface MathSegment {
  type: 'math'
  value: string
  block: boolean
}

// Matches $$block$$ before $inline$ so block math isn't split into two inline matches.
const MATH_SEGMENT_REGEX = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g

function splitMathSegments(text: string): (TextSegment | MathSegment)[] {
  const segments: (TextSegment | MathSegment)[] = []
  let lastIndex = 0
  MATH_SEGMENT_REGEX.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = MATH_SEGMENT_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'math', value: match[1], block: true })
    } else if (match[2] !== undefined) {
      segments.push({ type: 'math', value: match[2], block: false })
    }
    lastIndex = MATH_SEGMENT_REGEX.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}

function KatexSpan({ latex, block }: { latex: string; block: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { throwOnError: true, trust: false, displayMode: block, output: 'html' })
    } catch {
      return null
    }
  }, [latex, block])

  if (html === null) {
    // Broken LaTeX never reaches the student as code: show it as readable plain text.
    return <span>{mathToPlainText(block ? `$$${latex}$$` : `$${latex}$`)}</span>
  }

  return <span className={block ? 'my-1 block overflow-x-auto' : undefined} dangerouslySetInnerHTML={{ __html: html }} />
}

export default function MathText({ text, className }: MathTextProps) {
  const segments = useMemo(() => splitMathSegments(text), [text])

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <span key={index}>{mathToPlainText(segment.value, false)}</span>
        ) : (
          <KatexSpan key={index} latex={segment.value} block={segment.block} />
        ),
      )}
    </span>
  )
}
