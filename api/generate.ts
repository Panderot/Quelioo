import { withAuth } from './_lib/with-auth.js'
import { generateRequestHandler } from './_lib/generate.js'

export default withAuth(generateRequestHandler)
