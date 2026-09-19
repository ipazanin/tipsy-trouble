import { readFileSync } from 'node:fs'
import { chromium, firefox, expect, test, type Page } from '@playwright/test'
import ts from 'typescript'
import type {
  PeerTransport,
  PeerTransportStatus,
} from '../src/features/multiplayer/infrastructure/peerTransport'

interface TransportHarness {
  transport: PeerTransport
  status: PeerTransportStatus
  messages: string[]
  errors: string[]
  configurations: RTCConfiguration[]
}
declare global {
  interface Window {
    peerHarness: TransportHarness
    transportModule: {
      createPeerTransport: typeof import('../src/features/multiplayer/infrastructure/peerTransport').createPeerTransport
    }
  }
}

function browserTransportScript() {
  const modules = ['pairingCodec', 'messageFrames', 'peerTransport'].map((name) => {
    const source = readFileSync(
      new URL(`../src/features/multiplayer/infrastructure/${name}.ts`, import.meta.url),
      'utf8',
    )
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    return `modules[${JSON.stringify(`./${name}`)}] = (exports, require) => {${compiled}\n};`
  })
  return `(() => { const modules = {}; const cache = {}; ${modules.join('\n')}
    function require(name) { if (!cache[name]) { cache[name] = {}; modules[name](cache[name], require); } return cache[name]; }
    window.transportModule = require('./peerTransport'); })();`
}
async function initialize(page: Page, baseURL: string) {
  await page.route(baseURL, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Local transport test</title>',
    }),
  )
  await page.goto(baseURL)
  await page.addScriptTag({ content: browserTransportScript() })
  await page.evaluate(() => {
    const harness = { status: 'idle', messages: [], errors: [], configurations: [] } as Omit<
      TransportHarness,
      'transport'
    >
    const transport = window.transportModule.createPeerTransport({
      onMessage: (message) => harness.messages.push(message),
      onStatus: (status) => {
        harness.status = status
      },
      onError: (error) => harness.errors.push(error.message),
      createPeerConnection: (configuration) => {
        harness.configurations.push(configuration)
        return new RTCPeerConnection(configuration)
      },
    })
    window.peerHarness = Object.assign(harness, { transport })
  })
}
async function pair(host: Page, guest: Page) {
  const offer = await host.evaluate(() => window.peerHarness.transport.createOffer())
  const answer = await guest.evaluate(
    (token) => window.peerHarness.transport.acceptOffer(token),
    offer,
  )
  await host.evaluate((token) => window.peerHarness.transport.acceptAnswer(token), answer)
  await expect.poll(() => host.evaluate(() => window.peerHarness.status)).toBe('connected')
  await expect.poll(() => guest.evaluate(() => window.peerHarness.status)).toBe('connected')
}

test('manual complete-SDP pairing transfers chunked JSON and reconnects across Chromium and Firefox', async ({
  browserName,
  baseURL,
}) => {
  // Both browser instances are launched here, once across the project matrix.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(
    browserName !== 'chromium',
    'This cross-browser transport test owns both browser instances.',
  )
  test.setTimeout(90_000)
  test.info().annotations.push({
    type: 'diagnostic',
    description:
      'Test-only Chromium flag exposes host ICE addresses because this environment cannot resolve WebRTC mDNS names. Production never sets this flag or uses ICE servers.',
  })
  const hostBrowser = await chromium.launch({
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  })
  const guestBrowser = await firefox.launch()
  try {
    const host = await hostBrowser.newPage()
    const guest = await guestBrowser.newPage()
    await Promise.all([initialize(host, baseURL!), initialize(guest, baseURL!)])
    await pair(host, guest)
    const snapshot = JSON.stringify({
      revision: 1,
      image: `data:image/jpeg;base64,${'a'.repeat(1_000_000)}`,
      text: '🍋'.repeat(20_000),
    })
    await host.evaluate((message) => window.peerHarness.transport.send(message), snapshot)
    await expect
      .poll(() => guest.evaluate(() => window.peerHarness.messages[0]), { timeout: 15_000 })
      .toBe(snapshot)
    await guest.evaluate(() =>
      window.peerHarness.transport.send(JSON.stringify({ revision: 1, acknowledged: true })),
    )
    await expect
      .poll(() => host.evaluate(() => window.peerHarness.messages[0]))
      .toBe('{"revision":1,"acknowledged":true}')
    for (const page of [host, guest])
      expect(await page.evaluate(() => window.peerHarness.errors)).toEqual([])
    await host.evaluate(() => window.peerHarness.transport.close())
    await expect
      .poll(() => guest.evaluate(() => window.peerHarness.status))
      .toMatch(/^(closed|failed)$/)
    await guest.evaluate(() => {
      window.peerHarness.errors = []
    })
    await pair(host, guest)
    await guest.evaluate(() => window.peerHarness.transport.send('reconnected'))
    await expect.poll(() => host.evaluate(() => window.peerHarness.messages[1])).toBe('reconnected')
    for (const page of [host, guest]) {
      expect(await page.evaluate(() => window.peerHarness.errors)).toEqual([])
      expect(await page.evaluate(() => window.peerHarness.configurations)).toEqual([
        { iceServers: [], bundlePolicy: 'max-bundle' },
        { iceServers: [], bundlePolicy: 'max-bundle' },
      ])
    }
    await Promise.all(
      [host, guest].map((page) => page.evaluate(() => window.peerHarness.transport.close())),
    )
  } finally {
    await Promise.all([hostBrowser.close(), guestBrowser.close()])
  }
})
