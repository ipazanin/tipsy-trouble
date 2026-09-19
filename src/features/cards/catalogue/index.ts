import { parseCardDefinitions } from '../domain/cards'
import { cardMechanics } from './definitions'
import englishCards from './en.json'

export const builtInCards = parseCardDefinitions(
  cardMechanics.map((mechanics) => {
    const wording = englishCards[mechanics.id as keyof typeof englishCards]
    if (!wording) {
      throw new Error(`Missing English wording for card ${mechanics.id}.`)
    }

    return { ...mechanics, ...wording, contentLocale: 'en' }
  }),
)
