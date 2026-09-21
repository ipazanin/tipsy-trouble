# Tipsy Trouble

[Play Tipsy Trouble](https://ipazanin.github.io/tipsy-trouble/)

A drinking card game for a shared device or directly connected player phones: reusable players and photos, custom cards, temporary rules with visible countdowns, and permanent rules written by the table.

If you enjoy the game and want to support its development, you can [buy me a coffee](https://buymeacoffee.com/ipazanin).

The app runs on GitHub Pages and caches its complete built-in game for offline play after the first successful online visit. Game progress and personal collections are saved locally in IndexedDB. Export a backup from Library → Backups before clearing browser data or moving to another device.

## Development

Use Node 24.21 and npm 11 or newer.

```sh
nvm install
npm ci
npm run dev
```

Open the URL printed by Vite, including `/tipsy-trouble/`. Hash routing supports direct links and reloads on GitHub Pages without server rewrites.

```sh
npm run cards:check
npm run lint
npm run format:check
npm run test:coverage
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Browser tests build and serve the production app on port 4175. They cover Firefox, a narrow Firefox viewport, Chromium, and mobile WebKit. Chromium and Firefox use offline emulation. WebKit checks cached play after its test origin is shut down, because [Playwright's WebKit offline emulation currently rejects service-worker navigation](https://github.com/microsoft/playwright/issues/42775). Mobile emulation and origin outages do not replace installation, airplane-mode, and keyboard checks on physical phones.

Business-logic coverage must reach at least 96% for statements, branches, functions, and lines in each domain module, game and multiplayer orchestration module, and backup/import policy module. `npm run test:coverage` enforces these thresholds locally and in CI; its HTML report is written to `coverage/index.html`. Browser tests verify the IndexedDB and image-processing adapters against real browser APIs.

The service worker runs in production builds. To check offline behavior manually, run `npm run build` and `npm run preview`, open the app online until it reports offline readiness, then disconnect and reload. Development mode does not register a worker.

## Gameplay

- One completed card is one turn. Temporary rules activate and advance in a single saved action; there is no separate pass action. Every player taking a turn completes one circle.
- After circles 2, 4, 6, and so on, the next player creates a permanent house rule that applies to everyone. This extra prompt does not consume a turn. Each player authors one rule.
- Temporary rules count subsequent completed turns, excluding the card that creates the rule. A duration of one circle counts as one turn per player. House-rule prompts do not reduce countdowns.
- Ordinary cards are drawn without replacement, then reshuffled. Special cards use a separate probability and game limit: 1% and one appearance by default. The host can change both settings. The same special never repeats within a game.
- The two rare specials use three and five sips; neither asks players to finish their drink.
- A game's roster and deck are fixed when it starts. Editing saved players or custom cards affects future games.
- New-game setup is unavailable while a game is active. Resume the saved game or end it through its confirmation dialog first.
- Advanced setup accepts an optional deck seed. Reusing it with the same deck order, player order, settings, and choices reproduces the card sequence. The game saves its random state after each action, including across refreshes and backups. Leave the seed blank for fresh random draws.

## Cards and language

The complete [card catalogue](docs/cards.md) lists every built-in card for review, with its stable ID, exact English wording, target, duration, and artwork theme. It is an original Tipsy Trouble deck; it is not a verbatim copy or a verified complete mapping of Drunk Pirate. Run `npm run cards:generate` after editing the catalogue; CI checks that this document matches the source.

For later analysis, `docs/card-analysis/` preserves a snapshot dated September 21, 2026: [all 200 Tipsy Trouble cards](docs/card-analysis/tipsy-trouble-cards.json) with their wording, mechanics, and artwork metadata, alongside [Drunk Pirate reference notes](docs/card-analysis/drunk-pirate-reference.json). The Drunk Pirate file contains sources and research notes only; it does not contain their card deck. These files are historical snapshots and do not update with the live catalogue.

Built-in mechanics live in `src/features/cards/catalogue/definitions.ts`; English wording lives in the adjacent `en.json`. Stable card IDs join the two. Add definitions and wording together; catalogue checks catch missing or orphaned text.

Save up to 1,000 custom cards independently of the built-in catalogue size. Custom cards use the same validated definition format. Their `contentLocale` records the language they were written in. Text renders as plain text. Creating a permanent rule during a game does not add a reusable card to the library.

The Library groups saved players, cards, and backups. Its card lists separate enabled and disabled custom cards from enabled and disabled built-in cards. Toggles control future games and travel with backups; a game already in progress keeps its original deck. At least one ordinary card must remain enabled to start a game.

Custom cards start with a stock image; an optional JPEG, PNG, or WebP upload can replace it. Uploads up to 10 MB are resized to at most 1200 × 800 pixels and 512 KiB. Images stay on the device, travel with exported backups, and are sent directly to paired phones when their card is shown. Game snapshots reference immutable stored images, so editing or deleting a library card does not change artwork in a game already in progress.

Card photos are local WebP assets in `public/artwork`, cached with the game. Built-in pairings and photographer/source/license metadata live in `src/features/cards/artwork`. Custom card IDs deterministically select from ten templates, so an image stays consistent across edits and reloads. Photos are used under the [Unsplash License](https://unsplash.com/license); each card links to its photographer’s source page. They are decorative, so all instructions remain in accessible text.

UI wording is in `src/app/i18n`. English is the initial locale. Further localization must adapt language-dependent challenges and cultural references, in addition to translating text. Each game's resolved card text is saved with its deck.

## App installation

Installation and offline caching are separate: the game also works offline in a browser tab after caching. Use the app's installation help for platform instructions. Firefox on macOS currently supports offline play in a tab; Safari's Add to Dock provides a standalone Mac app. iPhone installation uses Safari's Add to Home Screen.

An update downloads in the background and is offered outside an active game. Game actions are saved as they happen; progress does not depend on an unload event. Local browser storage can be cleared or evicted, so installation is not a substitute for backups.

App icons are generated from `public/icon.svg`:

```sh
npm run icons:generate
```

The same icon appears in the app header, favicon, and install assets. Shared interface components and offline design assets are described in [the design system](docs/design-system.md).

The footer's Appearance setting offers Light, Dark, or Device default. Device default follows the system theme; an explicit choice stays on the device and works offline.

## Local multiplayer

Start a game, choose **Connect players**, and assign a phone to an existing player. The guest scans or pastes the host’s offer, then the host reads the guest’s reply inside the app. Repeat for up to 12 guest phones. QR generation, camera decoding, image upload, and paste fallbacks are bundled for offline use.

The current player or host can advance. The scheduled author can submit a permanent rule; the host can also enter it. Guests see the saved current card, its custom image when present, active rules, and player names. The future deck and random seed remain on the host. Joining another game leaves the guest’s own saved game intact.

Connections use WebRTC with no signaling, discovery, STUN, or TURN service. Use the same Wi-Fi or hotspot; some networks and browsers cannot establish a direct connection. Every device must cache the app before going offline. A refresh preserves the host’s game but requires pairing phones again. Keep the host page open; shared-device play remains available when connections fail.

See [multiplayer behavior and protocol](docs/multiplayer.md) for the pairing steps, limits, recovery, and test-environment restrictions. Physical-phone LAN and hotspot compatibility has not been verified in this workspace.

## Publishing

The workflow checks formatting, lint, unit tests, production builds, and browser behavior. Successful pushes to `main` publish the verified artifact after the repository's Pages source is configured to GitHub Actions. Pull requests only run checks.

The deployment path is `/tipsy-trouble/` throughout the Vite base, manifest, and service worker. No backend service or credentials are required for shared-device play.

## License

Original code and built-in card text are available under the [MIT License](LICENSE), copyright Ivan Pazanin. Third-party stock photographs retain the [Unsplash License](https://unsplash.com/license); attribution and sources are recorded in the artwork metadata. The footer links to a bundled license page that also works offline.
