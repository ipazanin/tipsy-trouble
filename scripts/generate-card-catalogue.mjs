import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { cardMechanics } from '../src/features/cards/catalogue/definitions.ts'

const catalogueUrl = new URL('../src/features/cards/catalogue/en.json', import.meta.url)
const pairingsUrl = new URL('../src/features/cards/artwork/pairings.json', import.meta.url)
const photosUrl = new URL('../src/features/cards/artwork/photos.json', import.meta.url)
const documentUrl = new URL('../docs/cards.md', import.meta.url)
const wording = JSON.parse(await readFile(catalogueUrl, 'utf8'))
const pairings = JSON.parse(await readFile(pairingsUrl, 'utf8'))
const photos = JSON.parse(await readFile(photosUrl, 'utf8'))
const identifiers = cardMechanics.map((card) => card.id)
const matchesIdentifiers = (records) => {
  const actual = Object.keys(records).sort()
  return JSON.stringify(actual) === JSON.stringify([...identifiers].sort())
}
if (
  new Set(identifiers).size !== identifiers.length ||
  !matchesIdentifiers(wording) ||
  !matchesIdentifiers(pairings)
) {
  throw new Error('Card mechanics, wording, and artwork must have the same unique identifiers.')
}
for (const card of cardMechanics) {
  const content = wording[card.id]
  if (
    !content.title.trim() ||
    content.title.length > 80 ||
    !content.text.trim() ||
    content.text.length > 240 ||
    !photos[pairings[card.id]]
  ) {
    throw new Error(`Invalid wording or artwork for ${card.id}.`)
  }
}
const groups = [
  { kind: 'prompt', title: 'Prompts' },
  { kind: 'temporary-rule', title: 'Temporary rules' },
  { kind: 'special', title: 'Rare specials' },
].map((group) => ({ ...group, cards: cardMechanics.filter((card) => card.kind === group.kind) }))
const targetNames = {
  'current-player': 'Current player',
  'choose-player': 'Chosen player',
  everyone: 'Everyone',
}
const lines = [
  '# Card catalogue',
  '',
  `${cardMechanics.length} original English cards: ${groups[0].cards.length} prompts, ${groups[1].cards.length} temporary rules, and ${groups[2].cards.length} rare specials. Each heading includes the stable card ID used for review, saved games, and deck choices. Card wording below is copied directly from this project’s English catalogue.`,
  '',
  '## Provenance and scope',
  '',
  'This is an original Tipsy Trouble deck, not a reproduction or a verified complete mapping of Drunk Pirate’s catalogue. The public [Drunk Pirate instructions](https://drunkpirate.co.uk/?play) describe following drawn cards and rules that last multiple turns. Its [welcome screen](https://drunkpirate.co.uk/?welcome) advertises over 100 guest cards and 50 additional cards for signed-in users. Those public descriptions do not establish the complete card inventory, which has not been enumerated here.',
  '',
  'Our wording, titles, and challenges were written for this project. Conversation, word games, memory, categories, voting, coordination, performance, creative scenarios, and positive group activities are this deck’s design categories; they are not an asserted inventory of another game. No third-party card text, application code, or proprietary artwork was copied. Card illustrations reuse this project’s credited, bundled photographs.',
  '',
  '## How this deck works',
  '',
  '- Players can enable or disable any card. Choices affect the next game; a running game keeps its saved deck.',
  '- Prompts and temporary rules form the ordinary deck. A new game needs at least one of these enabled.',
  '- Temporary-rule targets and durations are listed below. A circle is one turn per player. The activation turn does not consume the rule’s duration.',
  '- Rare specials default to a 1% chance per draw, with at most one per game. Each enabled special can appear at most once; players can change these settings or disable specials.',
  '- Last call uses three sips; Captain’s choice uses five. Any drink or no drink is welcome, and no one has to drink or perform a challenge.',
  '',
  'To regenerate this document, run `node scripts/generate-card-catalogue.mjs`. To check it without writing, add `--check`. The check fails when the document differs from the card sources.',
  '',
]
for (const group of groups) {
  lines.push(`## ${group.title} (${group.cards.length})`, '')
  for (const card of group.cards) {
    const content = wording[card.id]
    lines.push(
      `### \`${card.id}\` — ${content.title}`,
      '',
      `Kind: \`${card.kind}\` · Artwork: \`${pairings[card.id]}\``,
      '',
    )
    if (card.kind === 'temporary-rule') {
      const unit = card.duration.amount === 1 ? card.duration.unit.slice(0, -1) : card.duration.unit
      lines.push(
        `Target: ${targetNames[card.target]} (\`${card.target}\`) · Duration: ${card.duration.amount} ${unit}`,
        '',
      )
    }
    lines.push(content.text, '')
  }
}
const expected = `${lines.join('\n').trimEnd()}\n`
if (process.argv.includes('--check')) {
  const current = await readFile(documentUrl, 'utf8').catch(() => '')
  if (current !== expected) {
    console.error('docs/cards.md is out of date. Run node scripts/generate-card-catalogue.mjs.')
    process.exitCode = 1
  } else {
    console.log(`Card catalogue documentation matches all ${cardMechanics.length} cards.`)
  }
} else {
  await writeFile(documentUrl, expected)
  console.log(`Wrote ${cardMechanics.length} cards to ${fileURLToPath(documentUrl)}.`)
}
