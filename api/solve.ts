import { withAuth } from './_lib/with-auth.js'
import { solveRequestHandler } from './_lib/solve.js'

export default withAuth(solveRequestHandler)
