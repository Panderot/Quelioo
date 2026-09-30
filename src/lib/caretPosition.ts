/**
 * Classic "mirror div" technique for locating a character offset's on-screen coordinates inside a
 * <textarea> (browsers give no DOM Range API for a form control's internal text). Builds a hidden
 * div that copies every layout-relevant computed style, fills it with the text up to `position`
 * plus a marker span, measures the marker, then discards the div. Used only for one-off floating
 * UI placement (the "Mark as focus" button) — the always-visible highlight layer is a separate,
 * permanently mirrored element kept in sync via CSS, not this function.
 */

const MIRRORED_PROPERTIES: (keyof CSSStyleDeclaration)[] = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'textAlign',
  'wordSpacing',
  'tabSize',
  'direction',
]

export interface CaretCoordinates {
  top: number
  left: number
  height: number
}

export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): CaretCoordinates {
  const div = document.createElement('div')
  const computed = window.getComputedStyle(textarea)

  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.overflowWrap = 'break-word'
  div.style.top = '0'
  div.style.left = '-9999px'

  for (const prop of MIRRORED_PROPERTIES) {
    const value = computed[prop]
    if (typeof value === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CSSStyleDeclaration keys aren't all directly assignable, but every key mirrored above is
      ;(div.style as any)[prop] = value
    }
  }
  div.style.height = 'auto'
  div.style.overflow = 'hidden'

  const before = textarea.value.slice(0, position)
  const after = textarea.value.slice(position) || '.'
  div.textContent = before
  const marker = document.createElement('span')
  marker.textContent = after[0]
  div.appendChild(marker)
  div.appendChild(document.createTextNode(after.slice(1)))

  document.body.appendChild(div)
  const coordinates: CaretCoordinates = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: marker.offsetHeight,
  }
  document.body.removeChild(div)

  return coordinates
}
