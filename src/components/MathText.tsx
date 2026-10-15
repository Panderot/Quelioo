import katex from 'katex'
import { useMemo } from 'react'

import { mathToPlainText } from '../lib/mathPlain'
import { splitMathSegments } from '../lib/mathSegments'

interface MathTextProps {
  text: string
  className?: string
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
        ) : segment.trailing ? (
          <span key={index} className="whitespace-nowrap">
            <KatexSpan latex={segment.value} block={segment.block} />
            {mathToPlainText(segment.trailing, false)}
          </span>
        ) : (
          <KatexSpan key={index} latex={segment.value} block={segment.block} />
        ),
      )}
    </span>
  )
}
