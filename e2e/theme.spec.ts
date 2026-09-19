import { expect, test, type Page } from '@playwright/test'

async function expectTheme(page: Page, theme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    theme === 'light' ? '#faf7f0' : '#131d27',
  )
}

test('follows the device by default and preserves an explicit choice across navigation and reload', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  const appearance = page.getByRole('combobox', { name: 'Appearance', exact: true })
  await expect(appearance).toHaveValue('system')
  await expectTheme(page, 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expectTheme(page, 'dark')

  await appearance.selectOption('light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expectTheme(page, 'light')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Library', exact: true })
    .click()
  await expectTheme(page, 'light')
  await page.reload()
  await expect(appearance).toHaveValue('light')
  await expectTheme(page, 'light')

  await context.setOffline(true)
  await appearance.selectOption('dark')
  await expectTheme(page, 'dark')
  await context.setOffline(false)
  await page.reload()
  await expect(appearance).toHaveValue('dark')
  await expectTheme(page, 'dark')
  await appearance.selectOption('system')
  await page.emulateMedia({ colorScheme: 'light' })
  await expectTheme(page, 'light')
})

test('applies the persisted theme before the application can render', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('tipsy-trouble-theme', 'dark'))
  await page.route('**/*', (route) => {
    const request = route.request()
    if (
      request.resourceType() === 'script' &&
      !new URL(request.url()).pathname.endsWith('/theme.js')
    ) {
      return route.abort()
    }
    return route.continue()
  })
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#app')).toBeEmpty()
  await expectTheme(page, 'dark')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(19, 29, 39)')
})

test('keeps appearance usable when browser storage is unavailable', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) {
      if (key === 'tipsy-trouble-theme')
        throw new DOMException('Storage unavailable', 'SecurityError')
      return getItem.call(this, key)
    }
    Storage.prototype.setItem = function (key, preference) {
      if (key === 'tipsy-trouble-theme')
        throw new DOMException('Storage unavailable', 'SecurityError')
      return setItem.call(this, key, preference)
    }
  })
  await page.goto('./')
  await expectTheme(page, 'dark')
  const appearance = page.getByRole('combobox', { name: 'Appearance', exact: true })
  await appearance.selectOption('light')
  await expect(appearance).toHaveValue('light')
  await expectTheme(page, 'light')
  await page.getByRole('link', { name: 'MIT license', exact: true }).click()
  await expectTheme(page, 'light')
})

test('synchronizes explicit appearance choices across tabs', async ({ page, context }) => {
  await page.goto('./')
  const secondPage = await context.newPage()
  await secondPage.goto('./#/library')
  await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('dark')
  await expect(secondPage.getByRole('combobox', { name: 'Appearance', exact: true })).toHaveValue(
    'dark',
  )
  await expectTheme(secondPage, 'dark')
  await secondPage.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('light')
  await expect(page.getByRole('combobox', { name: 'Appearance', exact: true })).toHaveValue('light')
  await expectTheme(page, 'light')
  await secondPage.close()
})
