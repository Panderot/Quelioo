/**
 * Tracks whether the user is currently driving focus with a pointer or the
 * keyboard and reflects it as a class on <html>. Needed because Chrome's
 * native :focus-visible heuristic always matches on text fields (textarea,
 * input) even for a mouse click, which would otherwise force the keyboard
 * amber ring to show on every click — so focus styling below keys off this
 * tracked modality instead of :focus-visible for those elements.
 */
const KEYBOARD_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Enter',
  ' ',
  'Escape',
])

function setModality(modality: 'mouse' | 'keyboard') {
  const root = document.documentElement
  root.classList.toggle('modality-mouse', modality === 'mouse')
  root.classList.toggle('modality-keyboard', modality === 'keyboard')
}

function handleKeyDown(event: KeyboardEvent) {
  if (KEYBOARD_KEYS.has(event.key)) setModality('keyboard')
}

function handlePointerDown() {
  setModality('mouse')
}

export function initFocusModality() {
  setModality('mouse')
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('mousedown', handlePointerDown, true)
  document.addEventListener('touchstart', handlePointerDown, true)
}
