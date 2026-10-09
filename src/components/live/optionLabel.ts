import { useTranslation } from 'react-i18next'

import type { LiveKind } from '../../lib/live/core'

/** Label of option `index`: the quiz's own text, or True / False for a true/false question. */
export function useOptionLabel(kind: LiveKind, options: string[]) {
  const { t } = useTranslation()
  return (index: number) => (kind === 'truefalse' ? t(index === 0 ? 'live.true' : 'live.false') : (options[index] ?? ''))
}
