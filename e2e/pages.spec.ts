import { test, expect } from '@playwright/test'

test('loads the Pages site and retains the about route after reload', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle(/Tipsy Trouble/)
  await expect(page.getByRole('heading', { name: /Good company\./, level: 1 })).toBeVisible()
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', '/tipsy-trouble/icon.svg')
  await expect(page.getByRole('contentinfo')).toContainText('Domain Software Solutions d.o.o')
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: /Ivan Pazanin/ }),
  ).toHaveAttribute('href', 'mailto:ivan.pazanin1996@gmail.com')

  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'How to play', exact: true })
    .click()
  await expect(page).toHaveURL(/\/tipsy-trouble\/#\/about$/)
  await expect(page.getByRole('heading', { name: 'How to play', exact: true })).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'How to play', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('library links survive reload and the skip link focuses content without changing route', async ({
  page,
}) => {
  await page.goto('./#/library?tab=cards')
  const libraryNavigation = page.getByRole('navigation', { name: 'Library sections' })
  await expect(libraryNavigation.getByRole('link', { name: 'Cards', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your cards', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page).toHaveURL(/#\/library\?tab=cards$/)
  await libraryNavigation.getByRole('link', { name: 'Players', exact: true }).click()
  await expect(page).toHaveURL(/#\/library\?tab=players$/)
  await expect(page.getByRole('heading', { name: 'Your regulars', exact: true })).toBeVisible()
})
