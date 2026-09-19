import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { CardDefinition } from '../src/features/cards/domain/cards'
import { createGame, type GameSession } from '../src/features/game/domain/game'
import type { PlayerProfile } from '../src/features/players/domain/playerProfile'

const customCard: CardDefinition = {
  id: 'custom-backup-story',
  kind: 'prompt',
  title: 'Backup story',
  text: 'Tell everyone about your favourite holiday.',
  contentLocale: 'en',
}

async function storedLibrary(page: Page) {
  return page.evaluate(async () => {
    const snapshot = await new Promise<{
      players: PlayerProfile[]
      customCards: CardDefinition[]
      session?: GameSession
    }>((resolve, reject) => {
      const opening = indexedDB.open('tipsy-trouble')
      opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const database = opening.result
        const transaction = database.transaction(['players', 'customCards', 'session'])
        const players = transaction.objectStore('players').getAll()
        const customCards = transaction.objectStore('customCards').getAll()
        const session = transaction.objectStore('session').get('current')
        transaction.oncomplete = () => {
          database.close()
          resolve({
            players: players.result,
            customCards: customCards.result,
            session: session.result,
          })
        }
        transaction.onabort = () => {
          database.close()
          reject(transaction.error)
        }
      }
    })
    return {
      ...snapshot,
      players: snapshot.players.map((player) => ({
        id: player.id,
        name: player.name,
        hasPhoto: Boolean(player.photo),
      })),
    }
  })
}

async function selectBackup(page: Page, json: string) {
  const input = page.getByLabel('Choose a backup file')
  await input.setInputFiles([])
  await input.setInputFiles({
    name: 'tipsy-trouble-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  })
}

test('exports photos and cards, merges them, and restores a game only with confirmation', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto('./#/players')
  await page.getByLabel('Player name', { exact: true }).fill('Alice')
  await page.getByLabel('Player photo').setInputFiles('public/pwa-192x192.png')
  await expect(page.getByRole('button', { name: 'Remove photo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save player', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Alice from this game' })).toBeVisible()
  await page.getByLabel('Player name', { exact: true }).fill('Bob')
  await page.getByRole('button', { name: 'Save player', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Bob from this game' })).toBeVisible()
  await page.getByRole('button', { name: 'Deal us in' }).click()
  await page.getByRole('button', { name: 'Pass this card', exact: true }).click()
  await expect.poll(async () => (await storedLibrary(page)).session?.completedTurns).toBe(1)

  await page.goto('./#/cards')
  await page.getByRole('button', { name: 'Create a card' }).click()
  await page.getByLabel('Card title', { exact: true }).fill(customCard.title)
  await page.getByLabel('Card text', { exact: true }).fill(customCard.text)
  await page.getByRole('button', { name: 'Save card', exact: true }).click()
  await expect(page.getByRole('heading', { name: customCard.title, exact: true })).toBeVisible()
  const beforeExport = await storedLibrary(page)
  await page.goto('./#/library?tab=backups')
  const downloadReady = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloadReady
  const path = await download.path()
  expect(path).not.toBeNull()
  const json = await readFile(path!, 'utf8')
  const exported: {
    format: string
    version: number
    players: { name: string; photoDataUrl?: string }[]
    customCards: CardDefinition[]
    session: GameSession
  } = JSON.parse(json)
  expect(exported.format).toBe('tipsy-trouble')
  expect(exported.version).toBe(1)
  expect(exported.players.find((player) => player.name === 'Alice')?.photoDataUrl).toMatch(
    /^data:image\/jpeg;base64,/,
  )
  expect(exported.customCards).toEqual(beforeExport.customCards)
  expect(exported.session).toEqual(beforeExport.session)

  await page.goto('./#/play')
  await page.getByRole('button', { name: 'Pass this card', exact: true }).click()
  await expect.poll(async () => (await storedLibrary(page)).session?.completedTurns).toBe(2)
  const newerSession = (await storedLibrary(page)).session

  await page.goto('./#/library?tab=players')
  await page.getByRole('button', { name: 'Delete Alice', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice', exact: true })).toHaveCount(0)
  await page.goto('./#/cards')
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('heading', { name: customCard.title, exact: true })).toHaveCount(0)

  await page.goto('./#/library?tab=backups')
  await selectBackup(page, json)
  const restore = page.getByLabel('Also restore the game from this backup')
  await expect(restore).not.toBeChecked()
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await expect(
    page.getByText('Imported 2 players and 1 custom cards.', { exact: true }),
  ).toBeVisible()
  const merged = await storedLibrary(page)
  expect(merged.players).toEqual(beforeExport.players)
  expect(merged.customCards).toEqual(beforeExport.customCards)
  expect(merged.session).toEqual(newerSession)

  await page.goto('./#/players')
  const restoredPhoto = page.getByRole('button', { name: 'Add Alice to this game' }).locator('img')
  await expect(restoredPhoto).toBeVisible()
  await expect
    .poll(() => restoredPhoto.evaluate((photo: HTMLImageElement) => photo.naturalWidth))
    .toBeGreaterThan(0)
  await page.goto('./#/cards')
  await page.goto('./#/library?tab=backups')
  await selectBackup(page, json)
  await restore.check()
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await storedLibrary(page)).session).toEqual(newerSession)
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Import selected backup', exact: true })
    .click()
  await expect.poll(async () => (await storedLibrary(page)).session).toEqual(beforeExport.session)
  await page.goto('./#/play')
  await page.reload()
  await expect(page.getByRole('heading', { name: "Bob, you're up.", exact: true })).toBeVisible()
  await expect(
    page.getByText(beforeExport.session!.currentCard!.text, { exact: true }),
  ).toBeVisible()
})

test('rejects a reserved built-in card identifier without changing any library store', async ({
  page,
}) => {
  const players = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ]
  const session = createGame(players, [customCard], undefined, () => 0.999)
  await page.goto('./#/cards')
  await expect(page.getByRole('heading', { name: 'Your library.' })).toBeVisible()
  await page.evaluate(
    ({ players, customCard, session }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const transaction = database.transaction(
            ['players', 'customCards', 'session'],
            'readwrite',
          )
          for (const player of players) transaction.objectStore('players').put(player)
          transaction.objectStore('customCards').put(customCard)
          transaction.objectStore('session').put(session, 'current')
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onabort = () => {
            database.close()
            reject(transaction.error)
          }
        }
      }),
    { players, customCard, session },
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: customCard.title, exact: true })).toBeVisible()
  const beforeImport = await storedLibrary(page)
  await page.goto('./#/library?tab=backups')
  await selectBackup(
    page,
    JSON.stringify({
      format: 'tipsy-trouble',
      version: 1,
      players: [{ id: 'alice', name: 'Overwritten Alice' }],
      customCards: [
        { ...customCard, title: 'Overwritten card' },
        { ...customCard, id: 'three-word-day', title: 'Reserved collision' },
      ],
      session: createGame(
        players,
        [customCard],
        { specialChance: 0, maxSpecialsPerGame: 0 },
        () => 0.999,
      ),
    }),
  )
  await expect(page.getByRole('alert')).toContainText('reserved for built-in cards')
  await expect(
    page.getByRole('button', { name: 'Import selected backup', exact: true }),
  ).toBeDisabled()
  expect(await storedLibrary(page)).toEqual(beforeImport)
  await page.reload()
  expect(await storedLibrary(page)).toEqual(beforeImport)
  await page.goto('./#/library?tab=cards')
  await expect(page.getByRole('heading', { name: customCard.title, exact: true })).toBeVisible()
})
