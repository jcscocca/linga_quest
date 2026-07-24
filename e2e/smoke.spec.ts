import { expect, test } from '@playwright/test'

test('home renders with the deck loaded', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /Lingua Quest/ })).toBeVisible()
  // Before any probe, the home surfaces the probe and a session action.
  await expect(page.getByRole('button', { name: /Run the probe/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start session|Learn new words/i })).toBeVisible()
})

test('a study session grades a choice card', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Start session|Learn new words/i }).click()

  // First card of a fresh deck is the top-frequency word "el" in choice mode.
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible()
  await page.getByRole('button', { name: 'the', exact: true }).click()
  await page.getByRole('button', { name: 'Check' }).click()

  // Correct feedback and an advance control appear.
  await expect(page.getByText(/¡Correcto!/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue|Finish|Done/ })).toBeVisible()
})
