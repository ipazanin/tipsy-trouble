import { expect, test, type Page } from '@playwright/test'
import type { GameSession } from '../src/features/game/domain/game'

async function readGame(page: Page): Promise<GameSession> {
  return page.evaluate(
    () =>
      new Promise<GameSession>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const reading = database.transaction('session').objectStore('session').get('current')
          reading.onsuccess = () => {
            database.close()
            resolve(reading.result)
          }
          reading.onerror = () => {
            database.close()
            reject(reading.error)
          }
        }
      }),
  )
}

async function addPlayers(page: Page) {
  for (const name of ['Alice', 'Bob']) {
    await page.getByLabel('Player name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Save player', exact: true }).click()
    await expect(
      page.getByRole('button', { name: `Remove ${name} from this game`, exact: true }),
    ).toBeVisible()
  }
}

async function advance(page: Page, completedTurns: number) {
  const currentCard = (await readGame(page)).currentCard!
  await expect(page.getByRole('article')).toContainText(currentCard.title)
  if (currentCard.kind === 'temporary-rule' && currentCard.target === 'choose-player') {
    await page
      .getByRole('combobox', { name: 'Who gets this rule?', exact: true })
      .selectOption({ index: 1 })
  }
  await page.getByRole('button', { name: /^(Done · next player|Activate & next player)$/ }).click()
  await expect.poll(async () => (await readGame(page)).completedTurns).toBe(completedTurns)
}

test('hides new-game setup everywhere until the active game is ended', async ({ page }) => {
  await page.goto('./#/players')
  await addPlayers(page)
  await page.getByRole('button', { name: 'Deal us in', exact: true }).click()
  await expect(page).toHaveURL(/#\/play$/)
  const saved = await readGame(page)

  await page.goto('./#/')
  await expect(page.getByRole('link', { name: 'Resume game', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start playing', exact: true })).toHaveCount(0)
  await page.goto('./#/about')
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Resume game', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start playing', exact: true })).toHaveCount(0)
  await page.goto('./#/library')
  await expect(page.getByRole('link', { name: 'Set up a game', exact: true })).toHaveCount(0)
  await page.goto('./#/players')
  await expect(page).toHaveURL(/#\/play$/)
  await expect(page.getByLabel('Player name', { exact: true })).toHaveCount(0)
  expect(await readGame(page)).toEqual(saved)

  await page.getByRole('button', { name: 'End game', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'End game', exact: true }).click()
  await expect(page).toHaveURL(/#\/$/)
  await page.goto('./#/players')
  await expect(page.getByRole('heading', { name: "Who's in?", exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add Alice to this game', exact: true }),
  ).toBeVisible()
})

test('replays a seeded deck and preserves its random state through a refresh', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  const seed = 'W'.repeat(80)
  await page.goto('./#/players')
  await addPlayers(page)
  await page.getByText('Advanced settings', { exact: true }).click()
  await page.getByLabel('Deck seed (optional)', { exact: true }).fill(seed)
  await page.getByRole('button', { name: 'Deal us in', exact: true }).click()
  await expect(page).toHaveURL(/#\/play$/)
  const firstDeal = await readGame(page)
  expect(firstDeal.settings.seed).toBe(seed)
  await expect(page.getByText(seed, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(firstDeal.randomState).toEqual(expect.any(Number))
  await advance(page, 1)
  const secondDeal = await readGame(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: "Bob, you're up.", exact: true })).toBeVisible()
  expect(await readGame(page)).toEqual(secondDeal)
  await advance(page, 2)
  const thirdDeal = await readGame(page)

  await page.getByRole('button', { name: 'End game', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'End game', exact: true }).click()
  await expect(page).toHaveURL(/#\/$/)
  await page.goto('./#/players')
  for (const name of ['Alice', 'Bob']) {
    await page.getByRole('button', { name: `Add ${name} to this game`, exact: true }).click()
  }
  await page.getByText('Advanced settings', { exact: true }).click()
  await page.getByLabel('Deck seed (optional)', { exact: true }).fill(seed)
  await page.getByRole('button', { name: 'Deal us in', exact: true }).click()
  await expect(page).toHaveURL(/#\/play$/)
  expect(await readGame(page)).toEqual(firstDeal)
  await advance(page, 1)
  expect(await readGame(page)).toEqual(secondDeal)
  await advance(page, 2)
  expect(await readGame(page)).toEqual(thirdDeal)
})
