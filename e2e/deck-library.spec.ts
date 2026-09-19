import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { cardMechanics } from '../src/features/cards/catalogue/definitions'
import type { CardDefinition } from '../src/features/cards/domain/cards'
import { createGame, type GameSession } from '../src/features/game/domain/game'

const englishCards: Record<string, { title: string; text: string }> = JSON.parse(
  await readFile(new URL('../src/features/cards/catalogue/en.json', import.meta.url), 'utf8'),
)
const builtInCards = cardMechanics.map((card) => ({ ...card, ...englishCards[card.id]! }))

async function setCardEnabled(page: Page, title: string, enabled: boolean) {
  const toggle = page.getByRole('switch', { name: `Include ${title} in future games`, exact: true })
  await toggle.click()
  if (enabled) await expect(toggle).toBeChecked()
  else await expect(toggle).not.toBeChecked()
}

async function createCard(page: Page, title: string) {
  await page.goto('./#/library?tab=cards')
  await page.getByRole('button', { name: 'Create a card' }).click()
  await page.getByLabel('Card title', { exact: true }).fill(title)
  await page.getByLabel('Card text', { exact: true }).fill(`Read ${title} to the table.`)
  await page.getByRole('button', { name: 'Save card', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}
async function storedDeck(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        session?: GameSession
        disabledCardIds: string[]
        imageIds: string[]
        cards: CardDefinition[]
        players: { id: string; name: string }[]
      }>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const snapshot = database.transaction([
            'session',
            'preferences',
            'cardImages',
            'customCards',
            'players',
          ])
          const session = snapshot.objectStore('session').get('current')
          const preferences = snapshot.objectStore('preferences').get('deck')
          const cards = snapshot.objectStore('customCards').getAll()
          const players = snapshot.objectStore('players').getAll()
          const imageIds = snapshot.objectStore('cardImages').getAllKeys()
          snapshot.oncomplete = () => {
            database.close()
            resolve({
              session: session.result,
              disabledCardIds: preferences.result?.disabledCardIds ?? [],
              cards: cards.result,
              players: players.result,
              imageIds: imageIds.result as string[],
            })
          }
          snapshot.onabort = () => {
            database.close()
            reject(snapshot.error)
          }
        }
      }),
  )
}
async function exportBackup(page: Page) {
  await page.goto('./#/library?tab=backups')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloading
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    format: string
    version: number
    players: { id: string; name: string }[]
    customCards: CardDefinition[]
    deckPreferences?: { disabledCardIds: string[] }
  }
}
async function importBackup(page: Page, backup: unknown) {
  await page.goto('./#/library?tab=backups')
  const input = page.getByLabel('Choose a backup file')
  await input.setInputFiles([])
  await input.setInputFiles({
    name: 'deck.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
}

test('shows four complete lists, persists switches, and changes only future game decks', async ({
  page,
}) => {
  await page.goto('./#/players')
  for (const name of ['Alice', 'Bob']) {
    await page.getByLabel('Player name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Save player', exact: true }).click()
    await expect(page.getByRole('button', { name: `Remove ${name} from this game` })).toBeVisible()
  }
  await createCard(page, 'Our custom prompt')
  const enabledBuiltIn = page.getByRole('region', { name: 'Enabled built-in cards', exact: true })
  await expect(enabledBuiltIn.locator('article')).toHaveCount(builtInCards.length)
  await expect(enabledBuiltIn.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  for (const card of builtInCards)
    await expect(enabledBuiltIn.getByText(card.text, { exact: true })).toBeAttached()
  await expect(
    page.getByRole('region', { name: 'Disabled built-in cards', exact: true }).locator('article'),
  ).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Enabled custom cards', exact: true }).locator('article'),
  ).toHaveCount(1)
  await expect(
    page.getByRole('region', { name: 'Disabled custom cards', exact: true }).locator('article'),
  ).toHaveCount(0)
  const customId = (await storedDeck(page)).cards[0]!.id
  await setCardEnabled(page, 'Three-word day', false)
  await expect(
    page.getByRole('switch', { name: 'Include Three-word day in future games', exact: true }),
  ).not.toBeChecked()
  await expect(
    page.getByRole('switch', { name: 'Include Three-word day in future games', exact: true }),
  ).toBeFocused()
  await setCardEnabled(page, 'Our custom prompt', false)
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Disabled built-in cards', exact: true }).locator('article'),
  ).toHaveCount(1)
  await expect(
    page.getByRole('region', { name: 'Disabled custom cards', exact: true }).locator('article'),
  ).toHaveCount(1)
  await page.goto('./#/players')
  for (const name of ['Alice', 'Bob'])
    await page.getByRole('button', { name: `Add ${name} to this game` }).click()
  await page.getByRole('button', { name: 'Deal us in' }).click()
  await expect
    .poll(async () => (await storedDeck(page)).session?.deck.length)
    .toBe(builtInCards.length - 1)
  const originalSession = (await storedDeck(page)).session!
  expect(originalSession.deck.map((card) => card.id)).not.toContain('three-word-day')
  expect(originalSession.deck.map((card) => card.id)).not.toContain(customId)
  await page.goto('./#/library?tab=cards')
  await setCardEnabled(page, 'Three-word day', true)
  await setCardEnabled(page, 'Our custom prompt', true)
  await expect(
    page.getByRole('switch', { name: 'Include Our custom prompt in future games', exact: true }),
  ).toBeChecked()
  expect((await storedDeck(page)).session).toEqual(originalSession)
})

test('backs up deck choices, merges local-only choices, supports old backups, and rejects invalid preferences atomically', async ({
  page,
}) => {
  await createCard(page, 'Imported card')
  await setCardEnabled(page, 'Imported card', false)
  await setCardEnabled(page, 'Three-word day', false)
  const backup = await exportBackup(page)
  const importedId = backup.customCards[0]!.id
  expect(backup.deckPreferences?.disabledCardIds).toEqual(
    expect.arrayContaining([importedId, 'three-word-day']),
  )
  await createCard(page, 'Local only')
  await setCardEnabled(page, 'Local only', false)
  const localId = (await storedDeck(page)).cards.find((card) => card.title === 'Local only')!.id
  await setCardEnabled(page, 'Imported card', true)
  await setCardEnabled(page, 'Three-word day', true)
  await importBackup(page, backup)
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Imported')
  expect((await storedDeck(page)).disabledCardIds.sort()).toEqual(
    [importedId, localId, 'three-word-day'].sort(),
  )
  const legacy = { ...backup }
  delete legacy.deckPreferences
  await importBackup(page, legacy)
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Imported')
  const beforeInvalid = await storedDeck(page)
  await importBackup(page, {
    ...backup,
    players: [{ id: 'unwanted', name: 'Should not import' }],
    deckPreferences: { disabledCardIds: ['unknown-card'] },
  })
  await expect(page.getByRole('alert')).toContainText('unknown card')
  await expect(
    page.getByRole('button', { name: 'Import selected backup', exact: true }),
  ).toBeDisabled()
  expect(await storedDeck(page)).toEqual(beforeInvalid)
  await page.goto('./#/library?tab=cards')
  const importedCard = page
    .getByRole('region', { name: 'Disabled custom cards', exact: true })
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Imported card', exact: true }) })
  await importedCard.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(importedCard).toHaveCount(0)
  expect((await storedDeck(page)).disabledCardIds).not.toContain(importedId)
})

test('upgrades a version 2 image database without changing its cards or active deck', async ({
  page,
}) => {
  await page.goto('./pwa-192x192.png')
  const players = [
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
  ]
  const card: CardDefinition = {
    id: 'custom-v2',
    imageId: 'existing-image',
    title: 'Existing card',
    text: 'Keep this.',
    contentLocale: 'en',
    kind: 'prompt',
  }
  const session = createGame(players, [card], { specialChance: 0, maxSpecialsPerGame: 0 }, () => 0)
  await page.evaluate(
    ({ players, card, session }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble', 2)
        opening.onupgradeneeded = () => {
          opening.result.createObjectStore('players', { keyPath: 'id' })
          opening.result.createObjectStore('customCards', { keyPath: 'id' })
          opening.result.createObjectStore('session')
          opening.result.createObjectStore('cardImages', { keyPath: 'id' })
        }
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const write = database.transaction(
            ['players', 'customCards', 'session', 'cardImages'],
            'readwrite',
          )
          for (const player of players) write.objectStore('players').put(player)
          write.objectStore('customCards').put(card)
          const canvas = document.createElement('canvas')
          canvas.width = 20
          canvas.height = 20
          const bytes = Uint8Array.from(
            atob(canvas.toDataURL('image/jpeg').split(',')[1]!),
            (character) => character.charCodeAt(0),
          ).buffer
          write
            .objectStore('cardImages')
            .put({ id: 'existing-image', mimeType: 'image/jpeg', bytes })
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
  await page.goto('./#/library?tab=cards')
  await expect(
    page.getByRole('switch', { name: 'Include Existing card in future games', exact: true }),
  ).toBeChecked()
  const upgraded = await storedDeck(page)
  expect(upgraded.cards).toEqual([card])
  expect(upgraded.players).toEqual(players)
  expect(upgraded.session).toEqual(session)
  expect(upgraded.disabledCardIds).toEqual([])
  expect(upgraded.imageIds).toEqual(['existing-image'])
  await expect(
    page.getByRole('region', { name: 'Enabled custom cards', exact: true }).locator('img'),
  ).toHaveAttribute('src', /^blob:/)
})

test('keeps an all-disabled deck editable and explains why a new game cannot start', async ({
  page,
}) => {
  await importBackup(page, {
    format: 'tipsy-trouble',
    version: 1,
    players: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    customCards: [],
    deckPreferences: { disabledCardIds: builtInCards.map((card) => card.id) },
  })
  await page.getByRole('button', { name: 'Import selected backup', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Imported')
  await page.goto('./#/library?tab=cards')
  await expect(
    page.getByText(
      'Enable at least one prompt or temporary rule before starting a new game. Special cards cannot form a deck on their own.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Disabled built-in cards', exact: true }).locator('article'),
  ).toHaveCount(builtInCards.length)
  await page.goto('./#/players')
  for (const name of ['Alice', 'Bob'])
    await page.getByRole('button', { name: `Add ${name} to this game` }).click()
  await page.getByRole('button', { name: 'Deal us in' }).click()
  await expect(page.getByRole('alert')).toContainText('Enable at least one')
  expect((await storedDeck(page)).session).toBeUndefined()
})
