/** Options shared by the AI card generator UI and /api/cards. */

export const CARD_STYLES = ['term', 'qa', 'translation'] as const
export type CardStyle = (typeof CARD_STYLES)[number]

export const CARD_LEVELS = ['general', 'lgs', 'yks', 'kpss', 'yds', 'university'] as const
export type CardLevel = (typeof CARD_LEVELS)[number]

export const MIN_CARD_COUNT = 5
export const MAX_CARD_COUNT = 30
export const DEFAULT_CARD_COUNT = 10
export const MAX_TOPIC_CHARS = 120
/** Most recent deck fronts sent as the avoid list. */
export const MAX_AVOID_FRONTS = 300
