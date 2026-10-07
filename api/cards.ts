import { withAuth } from './_lib/with-auth.js'
import { cardsRequestHandler } from './_lib/cards.js'

export default withAuth(cardsRequestHandler)
