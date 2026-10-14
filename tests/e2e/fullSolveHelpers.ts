import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

import { expect } from './strict'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }

export const MOCK_RESULT = {
  topic: 'Linear equations',
  question: 'Solve for $x$: $3x + 7 = 2x + 15$',
  intro: 'The goal is to isolate $x$.',
  steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
  answer: '$x = 8$',
  tip: 'Do the same operation on both sides.',
  mistakes: ['Forgetting to change the sign when moving $7$ across.'],
  provider: 'openai',
  fallbackUsed: false,
}

export function fixtureBuffer(name: string): Buffer {
  return readFileSync(join(process.cwd(), 'tests/fixtures/images', name))
}

export const fileInput = (page: Page) => page.locator('[data-purpose="solve-upload-card"] input[type="file"]')
export const dropZone = (page: Page) => page.locator('[data-purpose="solve-upload-card"] [role="button"]')
export const solveButton = (page: Page) => page.locator('[data-purpose="primary-action-cta"] button').first()
export const solveError = (page: Page) => page.locator('[data-purpose="solve-error"]')
export const solveResult = (page: Page) => page.locator('[data-purpose="solve-result"]')

/** Dispatches a `drop` DragEvent carrying one file on the drop zone. */
export async function dropFile(page: Page, buffer: Buffer, name: string, mimeType: string) {
  await dropZone(page).evaluate(
    (el, { base64, name: fileName, mimeType: type }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], fileName, { type }))
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    },
    { base64: buffer.toString('base64'), name, mimeType },
  )
}

/** Drops a file of `megabytes` MB, built inside the page (shipping it through the protocol would cost seconds). */
export async function dropBigFile(page: Page, megabytes: number) {
  await dropZone(page).evaluate((el, size) => {
    const bytes = new Uint8Array(size * 1024 * 1024)
    bytes.set([0xff, 0xd8, 0xff, 0xe0])
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'huge.jpg', { type: 'image/jpeg' }))
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, megabytes)
}

/** Dispatches a `paste` ClipboardEvent carrying one file on `document` (Chromium only). */
export async function pasteFile(page: Page, buffer: Buffer, name: string, mimeType: string) {
  await page.evaluate(
    ({ base64, name: fileName, mimeType: type }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], fileName, { type }))
      document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
    },
    { base64: buffer.toString('base64'), name, mimeType },
  )
}

export async function waitForCropStep(page: Page) {
  await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 15_000 })
}

/** Picks a photo with the file input and skips the crop step with "Use whole photo". */
export async function pickPhoto(page: Page, name = 'plain.jpg', mimeType = 'image/jpeg', useWhole: string = en.crop.useWhole) {
  await fileInput(page).setInputFiles({ name, mimeType, buffer: fixtureBuffer(name) })
  await waitForCropStep(page)
  await page.getByRole('button', { name: useWhole }).click()
  await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
}

/** Opens a photo, solves it and waits for the result. */
export async function solveOnce(page: Page) {
  await pickPhoto(page)
  await solveButton(page).click()
  await expect(solveResult(page)).toBeVisible()
}
