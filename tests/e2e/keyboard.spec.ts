import { test, expect } from './fixtures'
import { chooseOption } from './helpers'

test('keyboard: Tab skips a disabled dropdown, Escape closes a menu and returns focus to its trigger', async ({ page }) => {
  await page.goto('/?lng=en')

  // "True or False" disables the MCQ Options Count field.
  await chooseOption(page, 'Question Type', 'True or False')
  const optionsCountTrigger = page.getByRole('button', { name: 'MCQ Options Count', exact: true })
  await expect(optionsCountTrigger).toBeDisabled()

  const difficultyTrigger = page.getByRole('button', { name: 'Difficulty Level', exact: true })
  await difficultyTrigger.focus()
  await page.keyboard.press('Tab')
  await expect(optionsCountTrigger).not.toBeFocused()

  const typeTrigger = page.getByRole('button', { name: 'Question Type', exact: true })
  await typeTrigger.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(typeTrigger).toBeFocused()
})
