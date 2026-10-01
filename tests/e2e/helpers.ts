import type { Page } from '@playwright/test'

/** Opens a param-grid / output-language custom listbox by its field label and clicks the named option. */
export async function chooseOption(page: Page, fieldLabel: string, optionLabel: string): Promise<void> {
  await page.getByRole('button', { name: fieldLabel, exact: true }).click()
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
}

export async function fillText(page: Page, text: string): Promise<void> {
  const box = page.locator('#quiz-content-input')
  await box.click()
  await box.fill(text)
}

export const SHORT_TEXT =
  'Water is essential for life. It covers most of the Earth\'s surface and exists in three states: solid, liquid, and gas. Plants, animals, and humans all depend on clean water to survive. The water cycle continuously moves water between the atmosphere, land, and oceans, sustaining ecosystems across the whole planet every single day.'

/** The `extras` object of every saved Solutions record (IndexedDB), [] when nothing is stored yet. */
export async function savedSolutionExtras(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open('quelio-solutions', 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('solutions', { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
    if (!db) return []
    const all = await new Promise<{ extras?: Record<string, unknown> }[]>((resolve) => {
      const request = db.transaction('solutions', 'readonly').objectStore('solutions').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve([])
    })
    db.close()
    return all.map((entry) => entry.extras ?? {})
  })
}
