import { describe, expect, it } from 'vitest'
import { CardValidationError, parseCardDefinition, parseCardDefinitions } from '../cards'

const prompt = { id: 'custom-story', title: ' Story ', text: ' Tell a story. ', kind: 'prompt' }

describe('card import validation', () => {
  it('normalizes text, preserves stable IDs and defaults author language to English', () => {
    expect(parseCardDefinition(prompt)).toEqual({
      ...prompt,
      title: 'Story',
      text: 'Tell a story.',
      contentLocale: 'en',
    })
    expect(parseCardDefinition({ ...prompt, contentLocale: 'pt-BR' }).contentLocale).toBe('pt-BR')
  })

  it('accepts explicit temporary rule duration and targeting', () => {
    const rule = {
      ...prompt,
      kind: 'temporary-rule',
      target: 'choose-player',
      duration: { amount: 2, unit: 'circles' },
    }
    expect(parseCardDefinition(rule)).toMatchObject({
      duration: { amount: 2, unit: 'circles' },
      target: 'choose-player',
    })
  })

  it.each([
    null,
    'prompt',
    { ...prompt, id: '../unsafe' },
    { ...prompt, text: '' },
    { ...prompt, title: 'x'.repeat(81) },
    { ...prompt, text: 'x'.repeat(241) },
    { ...prompt, kind: 'script' },
    { ...prompt, contentLocale: 'invalid language' },
    {
      ...prompt,
      kind: 'temporary-rule',
      target: ['everyone'],
      duration: { amount: 1, unit: 'turns' },
    },
    {
      ...prompt,
      kind: 'temporary-rule',
      target: 'everyone',
      duration: { amount: 0, unit: 'turns' },
    },
    {
      ...prompt,
      kind: 'temporary-rule',
      target: 'everyone',
      duration: { amount: 1.5, unit: 'turns' },
    },
    {
      ...prompt,
      kind: 'temporary-rule',
      target: 'everyone',
      duration: { amount: 1, unit: 'rounds' },
    },
    {
      ...prompt,
      kind: 'temporary-rule',
      target: 'unknown',
      duration: { amount: 1, unit: 'turns' },
    },
  ])('rejects malformed card %#', (candidate) => {
    expect(() => parseCardDefinition(candidate)).toThrow(CardValidationError)
  })

  it('requires a nonempty deck with unique IDs and at least one ordinary card', () => {
    for (const deck of [[], [prompt, prompt], [{ ...prompt, kind: 'special' }], 'cards']) {
      expect(() => parseCardDefinitions(deck)).toThrow(CardValidationError)
    }
  })

  it('imports text as plain content and discards executable-looking extra properties', () => {
    const parsed = parseCardDefinition({
      ...prompt,
      text: '<script>alert(1)</script>',
      onDraw: 'alert(1)',
    })
    expect(parsed.text).toBe('<script>alert(1)</script>')
    expect(parsed).not.toHaveProperty('onDraw')
  })
})
