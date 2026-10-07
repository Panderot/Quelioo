import { withAuth } from './_lib/with-auth.js'
import { songRequestHandler } from './_lib/song.js'

export default withAuth(songRequestHandler)
