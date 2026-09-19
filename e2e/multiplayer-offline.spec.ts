import { createServer, request } from 'node:http'
import { chromium, expect, test, type Page } from '@playwright/test'

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

async function waitForOfflineCache(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
}

async function pasteCode(page: Page, code: string) {
  await page.getByRole('textbox', { name: 'Paste a pairing code or link', exact: true }).fill(code)
  await page.getByRole('button', { name: 'Use this code', exact: true }).click()
}

async function pairingCode(page: Page) {
  await expect(page.getByRole('img', { name: 'Pairing QR code', exact: true })).toBeVisible()
  return page
    .getByRole('textbox', { name: 'Pairing code or link', exact: true, includeHidden: true })
    .inputValue()
}

async function advanceGuest(page: Page) {
  const target = page.getByRole('combobox', { name: 'Who gets this rule?', exact: true })
  if (await target.isVisible()) await target.selectOption({ label: 'Bob' })
  await page.getByRole('button', { name: /^(Done · next player|Activate & next player)$/ }).click()
}

test('pairs cached apps and saves a guest turn after the HTTP origin has stopped', async ({
  page: guest,
  baseURL,
}) => {
  test.setTimeout(120_000)
  test.info().annotations.push({
    type: 'local-mDNS-diagnostic',
    description:
      'Test-only Chromium host exposes numeric LAN candidates because this runner cannot resolve browser mDNS candidates. The guest uses normal browser settings; production uses no launch flags or ICE servers.',
  })
  const origin = await createIsolatedOrigin(baseURL!)
  const runtime = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] })
  const host = await runtime.newPage()
  const errors: string[] = []
  const externalRequests: string[] = []
  for (const page of [host, guest]) {
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(origin.appRoot).origin)
        externalRequests.push(request.url())
    })
  }
  try {
    await guest.goto(origin.appRoot)
    await expect(guest.getByRole('link', { name: 'Start playing', exact: true })).toBeVisible()
    await host.goto(`${origin.appRoot}#/players`)
    for (const name of ['Alice', 'Bob']) {
      await host.getByLabel('Player name', { exact: true }).fill(name)
      await host.getByRole('button', { name: 'Save player', exact: true }).click()
      await expect(
        host.getByRole('button', { name: `Remove ${name} from this game`, exact: true }),
      ).toBeVisible()
    }
    await host.getByText('Advanced settings', { exact: true }).click()
    await host.getByLabel('Deck seed (optional)', { exact: true }).fill('offline-peer-turn')
    await host.getByRole('button', { name: 'Deal us in', exact: true }).click()
    await expect(
      host.getByRole('heading', { name: "Alice, you're up.", exact: true }),
    ).toBeVisible()
    await Promise.all([host, guest].map(waitForOfflineCache))

    await origin.close()
    await expect(fetch(new URL('unavailable-probe', origin.appRoot))).rejects.toThrow(
      'fetch failed',
    )
    await Promise.all([host, guest].map((page) => page.goto(`${origin.appRoot}#/multiplayer`)))
    await guest.getByRole('button', { name: 'Read the host’s code', exact: true }).click()
    await host.getByRole('button', { name: 'Connect players', exact: true }).click()
    await host
      .getByRole('combobox', { name: 'Connect a phone for', exact: true })
      .selectOption({ label: 'Alice' })
    await host.getByRole('button', { name: 'Create pairing code', exact: true }).click()
    await pasteCode(guest, await pairingCode(host))
    await expect(
      guest.getByRole('heading', { name: 'Show this reply to the host', exact: true }),
    ).toBeVisible()
    const answer = await pairingCode(guest)
    await host.getByRole('button', { name: '2. Read the player’s reply', exact: true }).click()
    await pasteCode(host, answer)
    await expect(guest).toHaveURL(/#\/remote$/, { timeout: 35_000 })
    await host.getByRole('link', { name: 'Resume game', exact: true }).last().click()
    await expect(
      guest.getByRole('heading', { name: "Alice, you're up.", exact: true }),
    ).toBeVisible()
    await advanceGuest(guest)
    for (const page of [host, guest])
      await expect(
        page.getByRole('heading', { name: "Bob, you're up.", exact: true }),
      ).toBeVisible()
    await host.reload()
    await expect(host.getByRole('heading', { name: "Bob, you're up.", exact: true })).toBeVisible()
    await expect(fetch(new URL('still-unavailable-probe', origin.appRoot))).rejects.toThrow(
      'fetch failed',
    )
    expect(externalRequests).toEqual([])
    expect(errors).toEqual([])
  } finally {
    await Promise.all([runtime.close(), origin.close()])
  }
})
