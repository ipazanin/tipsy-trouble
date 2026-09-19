import { expect, test } from '@playwright/test'

test('reads a generated QR image, keeps invalid replies retryable, and fits 320px in both themes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 })
  await page.goto('./#/players')
  for (const name of ['Alice ' + 'W'.repeat(74), 'Bob']) {
    await page.getByRole('textbox', { name: 'Player name', exact: true }).fill(name)
    await page.getByRole('button', { name: 'Save player', exact: true }).click()
    await expect(
      page.getByRole('button', { name: `Remove ${name} from this game`, exact: true }),
    ).toBeVisible()
  }
  await page.getByRole('button', { name: 'Deal us in', exact: true }).click()
  await page.getByRole('link', { name: 'Connect players', exact: true }).click()
  await page.getByRole('button', { name: 'Create pairing code', exact: true }).click()
  const qrImage = page.getByAltText('Pairing QR code', { exact: true })
  await expect(qrImage).toBeVisible({ timeout: 15000 })
  const qrSource = await qrImage.getAttribute('src')
  expect(qrSource).toMatch(/^data:image\/png;base64,/)
  const qrBytes = Buffer.from(qrSource!.split(',')[1]!, 'base64')
  for (const theme of ['light', 'dark']) {
    await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption(theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  }
  await page.getByRole('button', { name: '2. Read the player’s reply', exact: true }).click()
  await page
    .getByLabel('Choose a QR image', { exact: true })
    .setInputFiles({ name: 'offer.png', mimeType: 'image/png', buffer: qrBytes })
  await expect(page.getByRole('alert')).toContainText(
    'This answer belongs to a different pairing attempt.',
  )
  await expect(
    page.getByRole('textbox', { name: 'Paste a pairing code or link', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '2. Read the player’s reply', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Stop sharing this game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Connect players', exact: true })).toBeVisible()
})

test('camera denial leaves image and paste alternatives usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    })
  })
  await page.goto('./#/multiplayer')
  await page.getByRole('button', { name: 'Read the host’s code', exact: true }).click()
  await page.getByRole('button', { name: 'Use camera', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText("Camera permission wasn't granted.")
  await expect(page.getByLabel('Choose a QR image', { exact: true })).toBeEnabled()
  await page
    .getByRole('textbox', { name: 'Paste a pairing code or link', exact: true })
    .fill('invalid pairing text')
  await page.getByRole('button', { name: 'Use this code', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Paste a pairing code or link', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Use this code', exact: true })).toBeEnabled()
})
