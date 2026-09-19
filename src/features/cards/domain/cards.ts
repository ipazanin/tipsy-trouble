export const MAX_DECK_CARDS = 1000

export interface CardContent {
  readonly id: string
  readonly title: string
  readonly text: string
  readonly contentLocale: string
}

export type CardDefinition =
  | (CardContent & { readonly kind: 'prompt' | 'special' })
  | (CardContent & {
      readonly kind: 'temporary-rule'
      readonly target: 'current-player' | 'everyone' | 'choose-player'
      readonly duration: { readonly amount: number; readonly unit: 'turns' | 'circles' }
    })

export class CardValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardValidationError'
  }
}

function record(candidate: unknown): Record<string, unknown> {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new CardValidationError('Each card must be an object.')
  }
  return candidate as Record<string, unknown>
}

function text(candidate: unknown, label: string, maximum: number): string {
  if (typeof candidate !== 'string' || !candidate.trim() || candidate.trim().length > maximum) {
    throw new CardValidationError(`${label} must contain between 1 and ${maximum} characters.`)
  }
  return candidate.trim()
}

export function parseCardDefinition(candidate: unknown): CardDefinition {
  const card = record(candidate)
  const id = text(card.id, 'Card ID', 100)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)) {
    throw new CardValidationError(
      'Card IDs may contain letters, numbers, dots, underscores, colons and hyphens.',
    )
  }
  const contentLocale = text(card.contentLocale ?? 'en', 'Content language', 35)
  if (!/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(contentLocale)) {
    throw new CardValidationError('Content language must be a language tag such as en or pt-BR.')
  }
  const content: CardContent = {
    id,
    title: text(card.title, 'Card title', 80),
    text: text(card.text, 'Card text', 240),
    contentLocale,
  }
  if (card.kind === 'prompt' || card.kind === 'special') {
    return { ...content, kind: card.kind }
  }
  if (card.kind !== 'temporary-rule') {
    throw new CardValidationError('Card kind must be prompt, temporary-rule or special.')
  }
  if (
    card.target !== 'current-player' &&
    card.target !== 'everyone' &&
    card.target !== 'choose-player'
  ) {
    throw new CardValidationError('Temporary rules need a supported target.')
  }
  const duration = record(card.duration)
  if (
    typeof duration.amount !== 'number' ||
    !Number.isInteger(duration.amount) ||
    duration.amount < 1 ||
    duration.amount > 100
  ) {
    throw new CardValidationError('Rule duration must be a whole number between 1 and 100.')
  }
  if (duration.unit !== 'turns' && duration.unit !== 'circles') {
    throw new CardValidationError('Rule duration unit must be turns or circles.')
  }
  return {
    ...content,
    kind: 'temporary-rule',
    target: card.target,
    duration: { amount: duration.amount, unit: duration.unit },
  }
}

export function parseCardDefinitions(candidate: unknown): CardDefinition[] {
  if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > MAX_DECK_CARDS) {
    throw new CardValidationError(`A deck must contain between 1 and ${MAX_DECK_CARDS} cards.`)
  }
  const cards = candidate.map(parseCardDefinition)
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new CardValidationError('Card IDs must be unique within a deck.')
  }
  if (cards.every((card) => card.kind === 'special')) {
    throw new CardValidationError('A deck needs at least one ordinary card.')
  }
  return cards
}
