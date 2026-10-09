import type { LiveKind } from '../../lib/live/core'

/** The answer buttons of a live game. Every option has its own colour AND shape, so a colour-blind student can tell
 * them apart, and the board and the phones show the same ones. */

export const OPTION_STYLES = [
  { key: 'triangle', background: '#b3261e', color: '#ffffff' },
  { key: 'diamond', background: '#1d4ed8', color: '#ffffff' },
  { key: 'circle', background: '#f5a524', color: '#0e1330' },
  { key: 'square', background: '#167a47', color: '#ffffff' },
  { key: 'pentagon', background: '#6d28d9', color: '#ffffff' },
] as const

export type OptionShapeKey = (typeof OPTION_STYLES)[number]['key']

/** True/false uses blue for "true" and red for "false"; every other question uses the options in order. */
export function optionStyleIndex(kind: LiveKind, option: number): number {
  return kind === 'truefalse' ? [1, 0][option] : option
}

export function optionStyle(kind: LiveKind, option: number) {
  return OPTION_STYLES[optionStyleIndex(kind, option)]
}
