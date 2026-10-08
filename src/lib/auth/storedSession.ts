/** True when the browser holds a saved Supabase session (read synchronously, before the async check ends). */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && /^sb-.+-auth-token$/.test(key)) return true
    }
  } catch {
    // Storage blocked: treat as signed out.
  }
  return false
}
