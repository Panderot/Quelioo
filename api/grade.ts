import { withAuth } from './_lib/with-auth.js'
import { gradeRequestHandler } from './_lib/grade.js'

export default withAuth(gradeRequestHandler)
