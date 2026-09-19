import { chromium, expect, test, type Page } from '@playwright/test'
import { createGame, type GameSession } from '../src/features/game/domain/game'
import type { CardDefinition } from '../src/features/cards/domain/cards'

const players = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
]
const prompts: CardDefinition[] = Array.from({ length: 8 }, (_, index) => ({
  id: `peer-story-${index}`,
  kind: 'prompt',
  title: `Shared story ${index}`,
  text: `Share memory number ${index} with the table.`,
  contentLocale: 'en',
}))
const temporary: CardDefinition = {
  id: 'peer-rule',
  kind: 'temporary-rule',
  title: 'Quiet voices',
  text: 'Use a quiet voice.',
  contentLocale: 'en',
  target: 'choose-player',
  duration: { amount: 2, unit: 'turns' },
  imageId: 'shared-artwork',
}
const game = () =>
  createGame(
    players,
    [temporary, ...prompts],
    { specialChance: 0, maxSpecialsPerGame: 0 },
    () => 0.999,
  )

async function seedGame(page: Page, appRoot: string, session: GameSession) {
  await page.goto(appRoot)
  await expect(page.getByRole('link', { name: 'Start playing', exact: true })).toBeVisible()
  await page.evaluate(async (session) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 48
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f2aa57'
    context.fillRect(0, 0, 64, 48)
    const photo = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg'),
    )
    const bytes = await photo.arrayBuffer()
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open('tipsy-trouble')
      opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const database = opening.result
        const transaction = database.transaction(['players', 'session', 'cardImages'], 'readwrite')
        for (const player of session.players) transaction.objectStore('players').put(player)
        transaction
          .objectStore('cardImages')
          .put({ id: 'shared-artwork', mimeType: 'image/jpeg', bytes })
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
    })
  }, session)
  await page.goto(`${appRoot}#/play`)
  await page.reload()
  await expect(page.getByRole('heading', { name: "Alice, you're up.", exact: true })).toBeVisible()
}

async function savedGame(page: Page): Promise<GameSession | undefined> {
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

async function pair(host: Page, guest: Page, playerId: string, appRoot: string) {
  await host
    .getByRole('combobox', { name: 'Connect a phone for', exact: true })
    .selectOption(playerId)
  await host.getByRole('button', { name: 'Create pairing code', exact: true }).click()
  await expect(host.getByRole('img', { name: 'Pairing QR code', exact: true })).toBeVisible({
    timeout: 15000,
  })
  const offer = await host
    .getByRole('textbox', { name: 'Pairing code or link', exact: true, includeHidden: true })
    .inputValue()
  await guest.goto(`${appRoot}#/multiplayer`)
  await guest.getByRole('button', { name: 'Read the host’s code', exact: true }).click()
  await guest
    .getByRole('textbox', { name: 'Paste a pairing code or link', exact: true })
    .fill(offer)
  await guest.getByRole('button', { name: 'Use this code', exact: true }).click()
  await expect(
    guest.getByRole('heading', { name: 'Show this reply to the host', exact: true }),
  ).toBeVisible({ timeout: 15000 })
  const answer = await guest
    .getByRole('textbox', { name: 'Pairing code or link', exact: true, includeHidden: true })
    .inputValue()
  await host.getByRole('button', { name: '2. Read the player’s reply', exact: true }).click()
  await host
    .getByRole('textbox', { name: 'Paste a pairing code or link', exact: true })
    .fill(answer)
  await host.getByRole('button', { name: 'Use this code', exact: true }).click()
  await expect(guest).toHaveURL(/#\/remote$/, { timeout: 35_000 })
  await expect(
    host.getByText('Their phone is connected and receiving this game.', { exact: true }),
  ).toBeVisible()
}

async function hostBrowser() {
  test.info().annotations.push({
    type: 'local-mDNS-diagnostic',
    description:
      'The automated host exposes numeric LAN candidates because this runner cannot resolve browser mDNS candidates. Guests use their normal browser settings; physical LAN validation remains separate.',
  })
  return chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] })
}

test('shares saved turns, chosen rules, custom artwork and author permissions with two phones', async ({
  page: alice,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const hostRuntime = await hostBrowser()
  const host = await hostRuntime.newPage()
  const bobContext = await browser.newContext()
  const bob = await bobContext.newPage()
  const errors: string[] = []
  const externalRequests: string[] = []
  for (const page of [host, alice, bob]) {
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(baseURL!).origin)
        externalRequests.push(request.url())
    })
  }
  try {
    const ownGame = createGame(
      players,
      prompts,
      { specialChance: 0, maxSpecialsPerGame: 0 },
      () => 0.5,
    )
    await seedGame(alice, baseURL!, ownGame)
    await seedGame(host, baseURL!, game())
    await host.getByRole('link', { name: 'Connect players', exact: true }).click()
    await pair(host, alice, 'alice', baseURL!)
    await pair(host, bob, 'bob', baseURL!)
    await host.getByRole('link', { name: 'Resume game', exact: true }).last().click()
    await expect(alice.locator('.card-artwork')).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
    await expect
      .poll(() =>
        alice.locator('.card-artwork').evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(64)
    await expect(
      bob.getByRole('button', { name: 'Activate & next player', exact: true }),
    ).toHaveCount(0)
    await host.evaluate(() => {
      const put = IDBObjectStore.prototype.put
      let failNext = true
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'session' && failNext) {
          failNext = false
          throw new DOMException('Storage full for test.', 'QuotaExceededError')
        }
        return put.apply(this, args)
      }
    })
    await alice
      .getByRole('combobox', { name: 'Who gets this rule?', exact: true })
      .selectOption('bob')
    await alice.getByRole('button', { name: 'Activate & next player', exact: true }).click()
    await expect(alice.getByRole('alert')).toContainText('The host could not save this action.')
    expect((await savedGame(host))!.completedTurns).toBe(0)
    await expect(bob.getByRole('heading', { name: "Alice, you're up.", exact: true })).toBeVisible()
    await alice.getByRole('button', { name: 'Activate & next player', exact: true }).click()
    await expect.poll(async () => (await savedGame(host))!.completedTurns).toBe(1)
    for (const guest of [alice, bob]) {
      await expect(
        guest.getByRole('heading', { name: "Bob, you're up.", exact: true }),
      ).toBeVisible()
      await expect(guest.getByText('For Bob', { exact: true })).toBeVisible()
      await expect(guest.getByText('2 turns remaining', { exact: true })).toBeVisible()
    }
    await expect(
      alice.getByRole('button', { name: 'Done · next player', exact: true }),
    ).toHaveCount(0)
    await host.getByRole('button', { name: 'Done · next player', exact: true }).click()
    await expect(
      alice.getByRole('button', { name: 'Done · next player', exact: true }),
    ).toBeVisible()
    await alice.getByRole('button', { name: 'Done · next player', exact: true }).click()
    await expect(bob.getByRole('button', { name: 'Done · next player', exact: true })).toBeVisible()
    await bob.getByRole('button', { name: 'Done · next player', exact: true }).click()
    await expect(alice.getByRole('textbox', { name: 'Your house rule', exact: true })).toBeVisible()
    await expect(bob.getByRole('textbox', { name: 'Your house rule', exact: true })).toHaveCount(0)
    await alice
      .getByRole('textbox', { name: 'Your house rule', exact: true })
      .fill('Say please before every request.')
    await alice.getByRole('button', { name: 'Make it a house rule', exact: true }).click()
    for (const page of [host, alice, bob])
      await expect(
        page.getByText('Say please before every request.', { exact: true }),
      ).toBeVisible()
    expect((await savedGame(host))!.houseRules[0]!.scope).toEqual({ kind: 'everyone' })
    expect(await savedGame(alice)).toEqual(ownGame)
    await alice
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Library', exact: true })
      .click()
    await alice.getByRole('link', { name: 'Return to shared game', exact: true }).click()
    await expect(alice).toHaveURL(/#\/remote$/)
    await host.getByRole('button', { name: 'End game', exact: true }).click()
    await host.getByRole('dialog').getByRole('button', { name: 'End game', exact: true }).click()
    await expect(
      alice.getByText('Connection lost. The last received turn is shown below.', { exact: true }),
    ).toBeVisible()
    await expect(
      alice.getByRole('button', { name: 'Done · next player', exact: true }),
    ).toHaveCount(0)
    expect(await savedGame(host)).toBeUndefined()
    expect(await savedGame(alice)).toEqual(ownGame)
    expect(errors).toEqual([])
    expect(externalRequests).toEqual([])
  } finally {
    await bobContext.close()
    await hostRuntime.close()
  }
})

test('keeps the host save after refresh and pairs a disconnected phone again', async ({
  page: guest,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const hostRuntime = await hostBrowser()
  const host = await hostRuntime.newPage()
  try {
    await seedGame(host, baseURL!, game())
    await host.getByRole('link', { name: 'Connect players', exact: true }).click()
    await pair(host, guest, 'alice', baseURL!)
    await guest
      .getByRole('combobox', { name: 'Who gets this rule?', exact: true })
      .selectOption('bob')
    await guest.getByRole('button', { name: 'Activate & next player', exact: true }).click()
    await expect.poll(async () => (await savedGame(host))!.completedTurns).toBe(1)
    const saved = await savedGame(host)
    await host.reload()
    await expect(
      guest.getByText('Connection lost. The last received turn is shown below.', { exact: true }),
    ).toBeVisible({ timeout: 35_000 })
    expect(await savedGame(host)).toEqual(saved)
    await host.getByRole('button', { name: 'Connect players', exact: true }).click()
    await guest.getByRole('button', { name: 'Leave shared game', exact: true }).click()
    await pair(host, guest, 'alice', baseURL!)
    await expect(guest.getByRole('heading', { name: "Bob, you're up.", exact: true })).toBeVisible()
    await expect(guest.getByText('2 turns remaining', { exact: true })).toBeVisible()
    expect(await savedGame(host)).toEqual(saved)
    await guest.reload()
    await expect(
      guest.getByRole('heading', { name: 'No shared game connected', exact: true }),
    ).toBeVisible()
    expect(await savedGame(host)).toEqual(saved)
  } finally {
    await hostRuntime.close()
  }
})
