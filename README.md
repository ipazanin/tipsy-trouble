# Tipsy Trouble

[Play Tipsy Trouble](https://ipazanin.github.io/tipsy-trouble/)

A drinking card game for one shared device: reusable players and photos, custom cards, temporary rules with visible countdowns, and permanent rules written by the table.

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
npm run lint
npm run format:check
npm run test:unit
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Browser tests build and serve the production app on port 4175. They cover Firefox, a narrow Firefox viewport, Chromium, and mobile WebKit. Chromium and Firefox use offline emulation. WebKit checks cached play after its test origin is shut down, because [Playwright's WebKit offline emulation currently rejects service-worker navigation](https://github.com/microsoft/playwright/issues/42775). Mobile emulation and origin outages do not replace installation, airplane-mode, and keyboard checks on physical phones.

The service worker runs in production builds. To check offline behavior manually, run `npm run build` and `npm run preview`, open the app online until it reports offline readiness, then disconnect and reload. Development mode does not register a worker.

## Gameplay

- One completed or skipped card is one turn. Every player taking a turn completes one circle.
- After circles 2, 4, 6, and so on, the next player creates a permanent house rule that applies to everyone. This extra prompt does not consume a turn. Each player authors one rule.
- Temporary rules count subsequent completed turns, excluding the card that creates the rule. A duration of one circle counts as one turn per player. House-rule prompts do not reduce countdowns.
- Ordinary cards are drawn without replacement, then reshuffled. Special cards use a separate probability and game limit: 1% and one appearance by default. The host can change both settings. The same special never repeats within a game.
- A game's roster and deck are fixed when it starts. Editing saved players or custom cards affects future games.

## Cards and language

Built-in mechanics live in `src/features/cards/catalogue/definitions.ts`; English wording lives in the adjacent `en.json`. Stable card IDs join the two. Add definitions and wording together; catalogue checks catch missing or orphaned text.

Custom cards use the same validated definition format. Their `contentLocale` records the language they were written in. Text renders as plain text. Creating a permanent rule during a game does not add a reusable card to the library.

The Library groups saved players, custom cards, and backups. Custom cards start with a stock image; an optional JPEG, PNG, or WebP upload can replace it. Uploads up to 10 MB are resized to at most 1200 × 800 pixels and 512 KiB. Images stay on the device and travel with exported backups. Game snapshots reference immutable stored images, so editing or deleting a library card does not change artwork in a game already in progress.

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

## Publishing

The workflow checks formatting, lint, unit tests, production builds, and browser behavior. Successful pushes to `main` publish the verified artifact after the repository's Pages source is configured to GitHub Actions. Pull requests only run checks.

The deployment path is `/tipsy-trouble/` throughout the Vite base, manifest, and service worker. No backend service or credentials are required for shared-device play.
