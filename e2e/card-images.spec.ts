import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { createGame } from '../src/features/game/domain/game'
import type { CardDefinition } from '../src/features/cards/domain/cards'

interface ImageBackup {
  format: string
  version: number
  players: { id: string; name: string }[]
  customCards: CardDefinition[]
  cardImages: { id: string; dataUrl: string }[]
  session?: ReturnType<typeof createGame>
}
async function exportBackup(page: Page): Promise<ImageBackup> {
  await page.goto('./#/library?tab=backups')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloading
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}
async function selectBackup(page: Page, backup: ImageBackup) {
  await page.goto('./#/library?tab=backups')
  await page.getByLabel('Choose a backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
}
async function restoreBackup(page: Page, backup: ImageBackup) {
  await selectBackup(page, backup)
  await page.getByLabel('Also restore the game from this backup').check()
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Import selected backup', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Imported')
}
async function imageCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const request = database.transaction('cardImages').objectStore('cardImages').count()
          request.onsuccess = () => {
            database.close()
            resolve(request.result)
          }
          request.onerror = () => {
            database.close()
            reject(request.error)
          }
        }
      }),
  )
}

test('uploaded artwork survives editing, deleting, game reload and backup restoration', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto('./#/library?tab=cards')
  await page.getByRole('button', { name: 'Create a card' }).click()
  await page.getByLabel('Card title', { exact: true }).fill('Our photo')
  await page.getByLabel('Card text', { exact: true }).fill('Tell the story behind this photo.')
  await page.getByLabel('Card image', { exact: false }).setInputFiles('public/pwa-192x192.png')
  await expect(page.getByRole('button', { name: 'Use stock photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Save card', exact: true }).click()
  await expect(page.locator('.saved-card-tile img')).toHaveAttribute('src', /^blob:/)
  await page.reload()
  await expect(page.locator('.saved-card-tile img')).toHaveAttribute('src', /^blob:/)
  const original = await exportBackup(page)
  expect(original.cardImages).toHaveLength(1)
  expect(original.cardImages[0]!.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
  expect(
    Buffer.from(original.cardImages[0]!.dataUrl.split(',')[1]!, 'base64').length,
  ).toBeLessThanOrEqual(512 * 1024)
  original.players = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ]
  original.session = createGame(
    original.players,
    original.customCards,
    { specialChance: 0, maxSpecialsPerGame: 0 },
    () => 0,
  )
  await restoreBackup(page, original)
  await page.goto('./#/library?tab=cards')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Use stock photo' }).click()
  await page.getByRole('button', { name: 'Save card', exact: true }).click()
  await expect(page.locator('.saved-card-tile img')).toHaveAttribute('src', /artwork\/.+\.webp$/)
  expect(await imageCount(page)).toBe(1)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('.saved-card-tile')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Your cards', exact: true })).toBeFocused()
  const gameOnly = await exportBackup(page)
  expect(gameOnly.customCards).toHaveLength(0)
  expect(gameOnly.cardImages).toEqual(original.cardImages)
  await page.goto('./#/play')
  await page.reload()
  await expect(page.locator('img[src^="blob:"]')).toBeVisible()
  await expect(page.getByText('Our photo', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'End game', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'End game', exact: true }).click()
  await expect.poll(() => imageCount(page)).toBe(0)
  await restoreBackup(page, gameOnly)
  await page.goto('./#/play')
  await expect(page.locator('img[src^="blob:"]')).toBeVisible()
})

test('rejects bad uploads and conflicting backup image bytes without partial writes', async ({
  page,
}) => {
  await page.goto('./#/library?tab=cards')
  await page.getByRole('button', { name: 'Create a card' }).click()
  await page.getByLabel('Card title', { exact: true }).fill('Original')
  await page.getByLabel('Card text', { exact: true }).fill('Original card.')
  const imageInput = page.getByLabel('Card image', { exact: false })
  for (const invalid of [
    { name: 'image.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
    { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') },
    {
      name: 'disguised.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
  ]) {
    await imageInput.setInputFiles(invalid)
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await imageCount(page)).toBe(0)
  }
  await imageInput.setInputFiles('public/pwa-192x192.png')
  await expect(page.getByRole('button', { name: 'Use stock photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Save card', exact: true }).click()
  await expect(page.locator('.saved-card-tile img')).toHaveAttribute('src', /^blob:/)
  const original = await exportBackup(page)
  const differentImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 20
    canvas.height = 20
    canvas.getContext('2d')!.fillRect(0, 0, 20, 20)
    return canvas.toDataURL('image/jpeg')
  })
  await selectBackup(page, {
    ...original,
    players: [{ id: 'unwanted', name: 'Must not be written' }],
    customCards: [{ ...original.customCards[0]!, title: 'Must not change' }],
    cardImages: [{ id: original.cardImages[0]!.id, dataUrl: differentImage }],
  })
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Nothing was imported')
  const afterConflict = await exportBackup(page)
  expect(afterConflict.players).toEqual(original.players)
  expect(afterConflict.customCards).toEqual(original.customCards)
  expect(afterConflict.cardImages).toEqual(original.cardImages)
  await selectBackup(page, { ...original, cardImages: [] })
  await expect(page.getByRole('alert')).toContainText('missing a referenced card image')
  await expect(
    page.getByRole('button', { name: 'Import selected backup', exact: true }),
  ).toBeDisabled()
})

test('upgrades the existing version 1 database without losing saved players, cards or the game', async ({
  page,
}) => {
  await page.goto('./pwa-192x192.png')
  const players = [
    { id: 'legacy-alice', name: 'Legacy Alice' },
    { id: 'legacy-bob', name: 'Legacy Bob' },
  ]
  const card: CardDefinition = {
    id: 'custom-legacy',
    title: 'Legacy card',
    text: 'Keep this card.',
    kind: 'prompt',
    contentLocale: 'en',
  }
  const session = createGame(players, [card], { specialChance: 0, maxSpecialsPerGame: 0 }, () => 0)
  await page.evaluate(
    ({ players, card, session }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble', 1)
        opening.onupgradeneeded = () => {
          opening.result.createObjectStore('players', { keyPath: 'id' })
          opening.result.createObjectStore('customCards', { keyPath: 'id' })
          opening.result.createObjectStore('session')
        }
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const write = database.transaction(['players', 'customCards', 'session'], 'readwrite')
          for (const player of players) write.objectStore('players').put(player)
          write.objectStore('customCards').put(card)
          write.objectStore('session').put(session, 'current')
          write.oncomplete = () => {
            database.close()
            resolve()
          }
          write.onabort = () => {
            database.close()
            reject(write.error)
          }
        }
      }),
    { players, card, session },
  )
  await page.goto('./#/library?tab=players')
  await expect(page.getByRole('heading', { name: 'Legacy Alice', exact: true })).toBeVisible()
  const upgraded = await exportBackup(page)
  expect(upgraded.players).toEqual(players)
  expect(upgraded.customCards).toEqual([card])
  expect(upgraded.session).toEqual(session)
  expect(await imageCount(page)).toBe(0)
})
