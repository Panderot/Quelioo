import { withAuth } from './_lib/with-auth.js'
import { lessonRequestHandler } from './_lib/lesson.js'

export default withAuth(lessonRequestHandler)
