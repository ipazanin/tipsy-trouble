# Tipsy Trouble agent guide

## Working in this repo

- Inspect nearby code, tests, and existing shared concepts before adding abstractions or dependencies. Keep changes focused; preserve unrelated work.
- Use the Node version in `.nvmrc` and npm version in `package.json`; install with `npm ci`. Let the configured formatter, linter, and compiler enforce mechanical conventions.
- Delegate independent work with explicit file ownership. Keep integration and Git mutations with the lead agent, within the user's authorization.

## Vue and TypeScript

- Use Composition API SFCs with `<script setup lang="ts">` and typed props/emits. Keep transient UI state local; extract reusable stateful behavior into focused `use*` composables.
- Use side-effect-free `computed` getters for derived state and watchers for effects. Preserve reactive inputs with refs/getters; clean up listeners, timers, and object URLs, and ignore stale async results after replacement or disposal.
- Keep game transitions pure in `src/features/game/domain`, orchestration in composables, and IndexedDB access in `src/infrastructure/storage`. Domain code must not depend on Vue or browser APIs.
- Preserve strict checking and `noUncheckedIndexedAccess`. Use discriminated unions for variants and readonly game snapshots. Treat imported JSON as `unknown`; validate it at the boundary instead of bypassing checks with `any` or unchecked assertions.
- Reuse `src/shared/components`, the tokens in `src/shared/styles/main.css`, and [the design system](docs/design-system.md). Keep feature layout styles local. Verify narrow screens, keyboard operation, labels, and dialog focus restoration.
- Keep UI wording in `src/app/i18n`. Preserve stable card IDs across mechanics, translations, and artwork. Regenerate icons with `npm run icons:generate`; regenerate lockfiles with npm.

## Persistence and offline behavior

- Keep the shared-device game usable offline with bundled assets. Preserve hash routing and the `/tipsy-trouble/` base across routes, manifest, and service worker. Never activate an update during an active game.
- Save a transition before displaying it. Failed writes must leave the current game intact and retryable; do not rely on unload events to save progress.
- Preserve existing saves and backups during schema changes. Validate imports before writing and commit related records atomically. Store plain serializable records rather than Vue proxies.
- Treat the active roster, deck, and image references as snapshots. Library edits and image cleanup must preserve assets referenced by the current game. Gameplay invariants are documented in [README.md](README.md#gameplay).

## Validation

- Test behavior and failure cases at the affected boundary. Use deterministic unit tests for game rules and real-browser tests for IndexedDB, uploads, focus, and offline behavior. Prefer accessible locators and retrying assertions over implementation selectors or sleeps.
- `npm run verify` checks lint, formatting, unit tests, types, and the build. `npm run test:e2e` builds and tests production on port 4175 across Chromium, Firefox, narrow Firefox, and mobile WebKit. Avoid concurrent builds or suites sharing that port.
- Run focused checks during iteration and the applicable full checks before handoff. Documentation-only edits need formatting checks. Service workers require production builds; report exactly what ran and any remaining limitations.

## Reference guidance

[AGENTS.md format](https://agents.md/) · [Vue typing](https://vuejs.org/guide/typescript/composition-api.html) · [Composables](https://vuejs.org/guide/reusability/composables.html) · [Computed state](https://vuejs.org/guide/essentials/computed.html) · [TypeScript narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) · [Playwright testing](https://playwright.dev/docs/best-practices)
