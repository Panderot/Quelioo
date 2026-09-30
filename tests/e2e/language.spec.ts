import { test, expect } from './fixtures'

test('language switcher works by mouse, persists after reload, and sets html lang', async ({ page }) => {
  await page.goto('/?lng=en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('button', { name: 'Change language' }).click()
  await page.getByRole('option', { name: 'Türkçe' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  await expect(page.getByRole('button', { name: 'Quiz Oluştur' })).toBeVisible()

  // Navigate without the ?lng= query so the reload's persistence comes from localStorage
  // (querystring wins over localStorage in the language detector's lookup order by design).
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  await expect(page.getByRole('button', { name: 'Quiz Oluştur' })).toBeVisible()

  await page.getByRole('button', { name: 'Dili değiştir' }).click()
  await page.getByRole('option', { name: 'Հայերէն (Արեւմտահայերէն)' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hyw')
})

test('language switcher works by keyboard', async ({ page }) => {
  await page.goto('/?lng=en')

  await page.getByRole('button', { name: 'Change language' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox', { name: 'Choose a language' })).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  // The button's accessible name changes with the language, so re-locate it by its new name.
  await expect(page.getByRole('button', { name: 'Dili değiştir' })).toBeFocused()
})
