import { expect, test } from '@playwright/test'

test('home renders with the deck loaded', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /Lingua Quest/ })).toBeVisible()
  // Before any probe, the home surfaces the probe and a session action.
  await expect(page.getByRole('button', { name: /Run the probe/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start session|Learn new words/i })).toBeVisible()
})

test('a study session grades a card and advances', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Start session|Learn new words/i }).click()

  // First card is a new word in choice mode. Pick any option (content-agnostic)
  // and check — either outcome reveals the answer and an advance control.
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible()
  await page.locator('.choice').first().click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('button', { name: /Continue|Finish|Done/ })).toBeVisible()
})
