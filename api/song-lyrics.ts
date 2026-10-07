import { withAuth } from './_lib/with-auth.js'
import { songLyricsRequestHandler } from './_lib/song-lyrics.js'

export default withAuth(songLyricsRequestHandler)
