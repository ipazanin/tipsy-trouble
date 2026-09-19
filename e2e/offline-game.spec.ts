import { Buffer } from 'node:buffer'
import { createServer, request } from 'node:http'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { CardDefinition } from '../src/features/cards/domain/cards'
import { createGame, type GameSession } from '../src/features/game/domain/game'

const players = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
]
const prompt = (id: string): CardDefinition => ({
  id,
  kind: 'prompt',
  title: `Story ${id}`,
  text: 'Share a memorable moment.',
  contentLocale: 'en',
})

function fixtureGame(deck: CardDefinition[] = [prompt('one')]): GameSession {
  return createGame(players, deck, { specialChance: 0, maxSpecialsPerGame: 0 }, () => 0.999)
}

async function seedLibrary(
  page: Page,
  session: GameSession,
  customCards: CardDefinition[] = [],
  appRoot = './',
) {
  await page.goto(`${appRoot}#/play`)
  await page.evaluate(
    ({ session, customCards }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onupgradeneeded = () => {
          const database = opening.result
          database.createObjectStore('players', { keyPath: 'id' })
          database.createObjectStore('customCards', { keyPath: 'id' })
          database.createObjectStore('session')
        }
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const transaction = database.transaction(
            ['players', 'customCards', 'session'],
            'readwrite',
          )
          for (const player of session.players) transaction.objectStore('players').put(player)
          for (const card of customCards) transaction.objectStore('customCards').put(card)
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
    { session, customCards },
  )
  await page.reload()
  await expect(
    page.getByRole('heading', {
      name: `${session.players[session.currentPlayerIndex]!.name}, you're up.`,
      exact: true,
    }),
  ).toBeVisible()
}

async function createIsolatedOrigin(upstreamUrl: string) {
  const upstream = new URL(upstreamUrl)
  const server = createServer((incoming, outgoing) => {
    const forwarded = request(
      {
        hostname: upstream.hostname,
        port: upstream.port,
        path: incoming.url,
        method: incoming.method,
        headers: { ...incoming.headers, host: upstream.host },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(outgoing)
      },
    )
    forwarded.on('error', () => outgoing.destroy())
    incoming.pipe(forwarded)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The test origin did not start.')
  return {
    appRoot: `http://127.0.0.1:${address.port}${upstream.pathname}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve()
          return
        }
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      }),
  }
}

async function createNetworkOutage(context: BrowserContext, browserName: string, baseURL: string) {
  if (browserName !== 'webkit') {
    return {
      appRoot: './',
      disconnect: () => context.setOffline(true),
      close: () => Promise.resolve(),
    }
  }
  const origin = await createIsolatedOrigin(baseURL)
  test.info().annotations.push({
    type: 'network-outage',
    description:
      'WebKit verifies a stopped origin instead of offline emulation: https://github.com/microsoft/playwright/issues/42775',
  })
  return {
    appRoot: origin.appRoot,
    disconnect: async () => {
      await origin.close()
      await expect(fetch(new URL('unavailable-probe', origin.appRoot))).rejects.toThrow(
        'fetch failed',
      )
    },
    close: origin.close,
  }
}

async function storedGame(page: Page): Promise<GameSession | undefined> {
  return page.evaluate(
    () =>
      new Promise<GameSession | undefined>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const request = database.transaction('session').objectStore('session').get('current')
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

async function showRules(page: Page) {
  const expand = page.getByRole('button', { name: 'Show rules', exact: true })
  if (await expand.isVisible()) await expand.click()
}

async function completeTurn(page: Page, completedTurns: number) {
  await page.getByRole('button', { name: 'Done · next player', exact: true }).click()
  await expect.poll(async () => (await storedGame(page))?.completedTurns).toBe(completedTurns)
}

async function waitForOfflineControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
}

test('saves player photos and resumes the actual dealt card after a reload', async ({ page }) => {
  await page.goto('./#/players')
  await page.getByLabel('Player name', { exact: true }).fill('Alice')
  await page.getByLabel('Player photo').setInputFiles('public/pwa-192x192.png')
  await expect(page.getByRole('button', { name: 'Remove photo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save player', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Remove Alice from this game', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Player name', { exact: true }).fill('Bob')
  await page.getByRole('button', { name: 'Save player', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Remove Bob from this game', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Deal us in' }).click()
  await page.getByRole('button', { name: 'Pass this card', exact: true }).click()
  await expect.poll(async () => (await storedGame(page))?.completedTurns).toBe(1)
  const saved = await storedGame(page)

  await page.reload()
  await expect(page.getByRole('heading', { name: "Bob, you're up.", exact: true })).toBeVisible()
  await expect(page.getByText(saved!.currentCard!.text, { exact: true })).toBeVisible()
  expect(await storedGame(page)).toEqual(saved)

  await page.goto('./#/players')
  const photo = page
    .getByRole('button', { name: 'Add Alice to this game', exact: true })
    .locator('img')
  await expect(photo).toBeVisible()
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await expect(
    page.getByRole('button', { name: 'Add Bob to this game', exact: true }),
  ).toBeVisible()
})

test('reloads offline and opens the previously unvisited custom card editor', async ({
  page,
  context,
  browserName,
  baseURL,
}) => {
  test.setTimeout(60_000)
  const outage = await createNetworkOutage(context, browserName, baseURL!)
  const appRoot = outage.appRoot
  try {
    await page.goto(appRoot)
    await waitForOfflineControl(page)
    await seedLibrary(page, fixtureGame([prompt('one'), prompt('two')]), [], appRoot)
    await expect(
      page.getByRole('heading', { name: "Alice, you're up.", exact: true }),
    ).toBeVisible()
    await waitForOfflineControl(page)
    await outage.disconnect()
    const response = await page.reload()
    expect(response?.fromServiceWorker()).toBe(true)
    await expect(
      page.getByRole('heading', { name: "Alice, you're up.", exact: true }),
    ).toBeVisible()
    const artwork = page.locator('.card-artwork')
    await expect
      .poll(() => artwork.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    const firstArtwork = await artwork.getAttribute('src')
    await completeTurn(page, 1)
    await expect(artwork).not.toHaveAttribute('src', firstArtwork!)
    await expect
      .poll(() => artwork.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)

    await page.goto(`${appRoot}#/cards`)
    await page.getByRole('button', { name: 'Create a card', exact: true }).click()
    await page.getByLabel('Card title', { exact: true }).fill('Offline memory')
    await page
      .getByLabel('Card text', { exact: true })
      .fill('Tell the room about your favourite trip.')
    await page.getByLabel('Card image').setInputFiles('public/pwa-192x192.png')
    await expect(page.getByRole('button', { name: 'Use stock photo', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save card', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Offline memory', exact: true })).toBeVisible()
    const customArtwork = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Offline memory', exact: true }) })
      .locator('img')
    await expect(customArtwork).toHaveAttribute('src', /^blob:/)
    await expect
      .poll(() => customArtwork.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Offline memory', exact: true })).toBeVisible()
    await expect(customArtwork).toHaveAttribute('src', /^blob:/)
    await expect
      .poll(() => customArtwork.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    await page.goto(`${appRoot}#/play`)
    await expect(page.getByRole('heading', { name: "Bob, you're up.", exact: true })).toBeVisible()
    expect((await storedGame(page))?.completedTurns).toBe(1)
  } finally {
    await outage.close()
  }
})

test('tracks chosen temporary rules and gives each player exactly one scheduled house rule', async ({
  page,
}) => {
  const temporary: CardDefinition = {
    id: 'quiet-voice',
    kind: 'temporary-rule',
    title: 'Quiet voices',
    text: 'Use a quiet voice.',
    contentLocale: 'en',
    target: 'choose-player',
    duration: { amount: 2, unit: 'turns' },
  }
  await seedLibrary(
    page,
    fixtureGame([temporary, ...Array.from({ length: 12 }, (_, index) => prompt(String(index)))]),
  )
  await page.getByLabel('Who gets this rule?').selectOption('bob')
  await page.getByRole('button', { name: 'Activate rule', exact: true }).click()
  await showRules(page)
  await expect(page.getByText('2 turns remaining', { exact: true })).toBeVisible()
  await expect(page.getByText('For Bob', { exact: true })).toBeVisible()
  const activatedSession = await storedGame(page)
  await page.reload()
  await showRules(page)
  await expect(page.getByText('2 turns remaining', { exact: true })).toBeVisible()
  expect(await storedGame(page)).toEqual(activatedSession)
  await expect(page.getByRole('article')).toContainText(activatedSession!.currentCard!.title)
  await expect(page.getByRole('heading', { name: "Alice, you're up.", exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Activate rule', exact: true })).toHaveCount(0)
  await completeTurn(page, 1)
  await showRules(page)
  await expect(page.getByText('2 turns remaining', { exact: true })).toBeVisible()
  await completeTurn(page, 2)
  await expect(page.getByText(/^1 turns? remaining$/)).toBeVisible()
  await completeTurn(page, 3)
  await expect(page.getByText('Use a quiet voice.', { exact: true })).toHaveCount(0)
  await completeTurn(page, 4)

  await expect(
    page.getByText('Alice, add one house rule. It stays until the game ends.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pass this card', exact: true })).toHaveCount(0)
  await page.getByLabel('Your house rule', { exact: true }).fill('Say please before every request.')
  await page.getByRole('button', { name: 'Make it a house rule', exact: true }).click()
  await expect.poll(async () => (await storedGame(page))?.houseRules.length).toBe(1)
  expect((await storedGame(page))?.completedTurns).toBe(4)
  const firstHouseRuleSession = await storedGame(page)
  await page.reload()
  await showRules(page)
  await expect(page.getByText('Say please before every request.', { exact: true })).toBeVisible()
  expect(await storedGame(page)).toEqual(firstHouseRuleSession)
  await expect(page.getByRole('article')).toContainText(firstHouseRuleSession!.currentCard!.title)
  await expect(page.getByRole('heading', { name: "Alice, you're up.", exact: true })).toBeVisible()

  for (let turn = 5; turn <= 8; turn++) await completeTurn(page, turn)
  await expect(
    page.getByText('Bob, add one house rule. It stays until the game ends.', { exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Your house rule', { exact: true })
    .fill('Alice introduces every card with a bow.')
  await expect(page.getByLabel('Who gets this rule?')).toHaveCount(0)
  await page.getByRole('button', { name: 'Make it a house rule', exact: true }).click()
  await expect.poll(async () => (await storedGame(page))?.houseRules.length).toBe(2)
  for (let turn = 9; turn <= 12; turn++) await completeTurn(page, turn)
  const session = await storedGame(page)
  expect(session?.phase).toBe('turn')
  expect(session?.houseRules.map((rule) => rule.authorId)).toEqual(['alice', 'bob'])
  expect(session?.houseRules[1]?.scope).toEqual({ kind: 'everyone' })
  await expect(
    page.getByRole('heading', { name: 'Time to make a rule.', exact: true }),
  ).toHaveCount(0)
})

test('rejects an invalid backup without changing saved players, cards or the game', async ({
  page,
}) => {
  const saved = fixtureGame()
  const existing = prompt('kept-card')
  await seedLibrary(page, saved, [existing])
  await page.goto('./#/cards')
  await expect(page.getByRole('heading', { name: existing.title, exact: true })).toBeVisible()
  const invalidBackup = {
    format: 'tipsy-trouble',
    version: 1,
    players: [
      { id: 'alice', name: 'Overwritten Alice' },
      { id: 'unexpected', name: 'Unexpected player' },
    ],
    customCards: [
      { ...existing, title: 'Overwritten card' },
      { ...prompt('invalid'), kind: 'unsupported' },
    ],
  }
  await page.goto('./#/library?tab=backups')
  await page.getByLabel('Choose a backup file').setInputFiles({
    name: 'invalid-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalidBackup)),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await page.reload()
  await page
    .getByRole('navigation', { name: 'Library sections' })
    .getByRole('link', { name: 'Cards', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: existing.title, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Overwritten card', exact: true })).toHaveCount(0)
  expect(await storedGame(page)).toEqual(saved)
  await page.goto('./#/players')
  await expect(
    page.getByRole('button', { name: 'Add Alice to this game', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add Bob to this game', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add Unexpected player to this game', exact: true }),
  ).toHaveCount(0)
})

test('places rules beside the card on laptops and reveals saved turns', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const longCard = {
    ...prompt('long'),
    text: Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join('\n'),
  }
  await seedLibrary(page, fixtureGame([longCard]))
  const card = page.getByRole('article')
  const rules = page.getByRole('region', { name: 'Active rules', exact: true })
  const cardBox = await card.boundingBox()
  const rulesBox = await rules.boundingBox()
  expect(cardBox).not.toBeNull()
  expect(rulesBox).not.toBeNull()
  expect(rulesBox!.x).toBeGreaterThan(cardBox!.x + cardBox!.width)
  expect(Math.abs(rulesBox!.y - cardBox!.y)).toBeLessThan(2)
  expect(cardBox!.width).toBeGreaterThan(450)
  await page
    .getByRole('button', { name: 'Done · next player', exact: true })
    .scrollIntoViewIfNeeded()
  await completeTurn(page, 1)
  const heading = page.getByRole('heading', { name: "Bob, you're up.", exact: true })
  await expect(heading).toBeFocused()
  await expect(heading).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('cancels ending through the dialog or Escape, then clears only the confirmed game', async ({
  page,
}) => {
  const session = fixtureGame()
  await seedLibrary(page, session, [prompt('kept')])
  const endButton = page.getByRole('button', { name: 'End game', exact: true })
  await endButton.click()
  const dialog = page.getByRole('dialog', { name: 'End this game?', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Keep playing', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Keep playing', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(endButton).toBeFocused()
  expect(await storedGame(page)).toEqual(session)
  await endButton.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await storedGame(page)).toEqual(session)
  await endButton.click()
  await dialog.getByRole('button', { name: 'End game', exact: true }).click()
  await expect(page).toHaveURL(/#\/$/)
  expect(await storedGame(page)).toBeUndefined()
  const libraryCounts = await page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const transaction = database.transaction(['players', 'customCards'])
          const playerCount = transaction.objectStore('players').count()
          const cardCount = transaction.objectStore('customCards').count()
          transaction.oncomplete = () => {
            database.close()
            resolve({ players: playerCount.result, cards: cardCount.result })
          }
          transaction.onabort = () => reject(transaction.error)
        }
      }),
  )
  expect(libraryCounts).toEqual({ players: 2, cards: 1 })
})

test('does not advance or reveal another turn when saving fails', async ({ page }) => {
  const longCard = {
    ...prompt('long'),
    text: Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join('\n'),
  }
  const session = fixtureGame([longCard])
  await seedLibrary(page, session)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'session')
        throw new DOMException('Test storage is full.', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  const next = page.getByRole('button', { name: 'Done · next player', exact: true })
  await next.scrollIntoViewIfNeeded()
  await next.focus()
  await next.press('Enter')
  await expect(page.getByRole('alert')).toContainText("Your game hasn't advanced.")
  await expect(
    page.getByRole('heading', { name: "Alice, you're up.", exact: true }),
  ).not.toBeFocused()
  expect(await storedGame(page)).toEqual(session)
  await expect(next).toBeInViewport()
})

test('keeps current and next players visible while scrolling a phone and expands rules inline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 })
  const temporary: CardDefinition = {
    ...prompt('long-rule'),
    kind: 'temporary-rule',
    target: 'everyone',
    text: Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join('\n'),
    duration: { amount: 2, unit: 'turns' },
  }
  await seedLibrary(page, fixtureGame([temporary]))
  await page.getByRole('button', { name: 'Activate rule', exact: true }).click()
  const turnbar = page.locator('.play-turnbar')
  await expect(turnbar).toBeInViewport()
  await expect(turnbar.getByText('Bob', { exact: true })).toBeVisible()
  const bounds = await turnbar.boundingBox()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeLessThan(5)
  const collapse = page.getByRole('button', { name: 'Hide rules', exact: true })
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await collapse.click()
  const expand = page.getByRole('button', { name: 'Show rules', exact: true })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expand.click()
  await expect(page.getByText('2 turns remaining', { exact: true })).toBeVisible()
  const cardBox = await page.getByRole('article').boundingBox()
  const rulesBox = await page
    .getByRole('region', { name: 'Active rules', exact: true })
    .boundingBox()
  expect(rulesBox!.y).toBeGreaterThan(cardBox!.y + cardBox!.height)
  await completeTurn(page, 1)
  const heading = page.getByRole('heading', { name: "Bob, you're up.", exact: true })
  await expect(heading).toBeFocused()
  await expect(heading).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('keeps the end dialog and saved game after deletion fails, then allows retrying', async ({
  page,
}) => {
  const session = fixtureGame()
  await seedLibrary(page, session)
  await page.evaluate(() => {
    const deleteRecord = IDBObjectStore.prototype.delete
    let failNextDeletion = true
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === 'session' && failNextDeletion) {
        failNextDeletion = false
        throw new DOMException('Test game deletion failed.', 'UnknownError')
      }
      return deleteRecord.apply(this, args)
    }
  })
  await page.getByRole('button', { name: 'End game', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'End this game?', exact: true })
  const confirm = dialog.getByRole('button', { name: 'End game', exact: true })
  await confirm.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('Test game deletion failed.')
  await expect(confirm).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Keep playing', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/#\/play$/)
  expect(await storedGame(page)).toEqual(session)
  await confirm.click()
  await expect(page).toHaveURL(/#\/$/)
  expect(await storedGame(page)).toBeUndefined()
})

test('keeps long player names compact and accessible on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  const roster = [
    { id: 'alice', name: 'W'.repeat(80) },
    { id: 'bob', name: 'M'.repeat(80) },
  ]
  const session = createGame(
    roster,
    [prompt('story')],
    { specialChance: 0, maxSpecialsPerGame: 0 },
    () => 0,
  )
  await seedLibrary(page, session)
  const turnbar = page.locator('.play-turnbar')
  const current = turnbar.getByRole('heading', {
    name: `${roster[0]!.name}, you're up.`,
    exact: true,
  })
  const next = turnbar.getByText(roster[1]!.name, { exact: true })
  await expect(current).toBeVisible()
  await expect(current).toHaveAttribute('title', roster[0]!.name)
  await expect(next).toBeVisible()
  await expect(next).toHaveAttribute('title', roster[1]!.name)
  const bounds = await turnbar.boundingBox()
  expect(bounds!.height).toBeLessThanOrEqual(110)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
