import { withAuth } from './_lib/with-auth.js'
import { extractUrlRequestHandler } from './_lib/extract-url.js'

export default withAuth(extractUrlRequestHandler)
