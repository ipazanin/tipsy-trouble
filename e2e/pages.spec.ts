import { test, expect } from '@playwright/test'
import { completeTurn, createGame, type GameSession } from '../src/features/game/domain/game'

test('loads the Pages site and retains the about route after reload', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle(/Tipsy Trouble/)
  await expect(page.getByRole('heading', { name: /Good company\./, level: 1 })).toBeVisible()
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', '/tipsy-trouble/icon.svg')
  await expect(page.getByRole('contentinfo')).toContainText('Domain Software Solutions d.o.o')
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: /Ivan Pazanin/ }),
  ).toHaveAttribute('href', 'mailto:ivan.pazanin1996@gmail.com')

  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'How to play', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'MIT license', exact: true }),
  ).toHaveAttribute('href', '#/license')

  await page.getByRole('main').getByRole('link', { name: 'How to play', exact: true }).click()
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

test('keeps a clear resume action and the saved turn across pages and reloads at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  const session = completeTurn(
    createGame(
      [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
      ],
      [
        {
          id: 'resume-story',
          kind: 'prompt',
          title: 'A saved story',
          text: 'Tell the room a story.',
          contentLocale: 'en',
        },
      ],
      { specialChance: 0, maxSpecialsPerGame: 0 },
      () => 0.5,
    ),
    () => 0.5,
  )
  await page.goto('./#/play')
  await expect(
    page.getByRole('heading', { name: 'The table is waiting.', exact: true }),
  ).toBeVisible()
  await page.evaluate(
    (savedSession) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('tipsy-trouble')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const transaction = database.transaction('session', 'readwrite')
          transaction.objectStore('session').put(savedSession, 'current')
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
    session,
  )
  await page.goto('./#/library?tab=cards')
  await page.reload()
  const savedGame = page.getByRole('complementary', { name: 'Game in progress', exact: true })
  await expect(savedGame.getByRole('link', { name: 'Resume game', exact: true })).toBeVisible()
  await expect(savedGame).toContainText('Turn 2 · Bob')
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Play', exact: true }),
  ).toHaveCount(0)

  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'MIT license', exact: true })
    .click()
  await expect(page).toHaveURL(/#\/license$/)
  await expect(page.getByRole('main')).toBeFocused()
  await expect(savedGame).toContainText('Turn 2 · Bob')
  await page.reload()
  await expect(savedGame).toContainText('Turn 2 · Bob')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await savedGame.getByRole('link', { name: 'Resume game', exact: true }).click()
  await expect(page).toHaveURL(/#\/play$/)
  await expect(page.getByRole('heading', { name: "Bob, you're up.", exact: true })).toBeVisible()
  await expect(savedGame).toHaveCount(0)
  const restoredSession = await page.evaluate(
    () =>
      new Promise<GameSession>((resolve, reject) => {
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
  expect(restoredSession).toEqual(session)
})
