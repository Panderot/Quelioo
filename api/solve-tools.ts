import { withAuth } from './_lib/with-auth.js'
import { solveToolsRequestHandler } from './_lib/solve-tools.js'

export default withAuth(solveToolsRequestHandler)
