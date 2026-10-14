import { clearDraft } from '../../hooks/useDraft'
import { resetArchiveCache, loadArchive } from '../archive'
import { onSessionEnd, onSessionStart } from '../auth/authStore'
import { resetFlashcardCache } from '../flashcardStorage'
import { deletePageDraft } from '../pageDraftStorage'
import { isFakeBackend } from '../supabase'

/** Wires the account data to the session: warm the Archive cache at sign-in (the Create page reads it
 * synchronously) and drop every in-memory copy, plus the unfinished-work drafts, when the session ends
 * so the next person on this device never sees it. Imported once from main.tsx. */

if (!isFakeBackend) {
  onSessionStart(() => {
    void loadArchive()
  })
  onSessionEnd(() => {
    resetArchiveCache()
    resetFlashcardCache()
    clearDraft()
    void deletePageDraft('solve')
    void deletePageDraft('create')
  })
}
