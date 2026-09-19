import { test, expect } from '@playwright/test'

test('loads the Pages site and retains the about route after reload', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle(/Tipsy Trouble/)
  await expect(page.getByRole('heading', { name: /A little chaos/ })).toBeVisible()

  await page.getByRole('link', { name: 'About the game', exact: true }).click()
  await expect(page).toHaveURL(/\/tipsy-trouble\/#\/about$/)
  await expect(page.getByRole('heading', { name: 'How to play', exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'How to play', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
