type PromptMechanics = { id: string; kind: 'prompt' | 'special' }
type RuleMechanics = {
  id: string
  kind: 'temporary-rule'
  target: 'current-player' | 'everyone' | 'choose-player'
  duration: { amount: number; unit: 'turns' | 'circles' }
}

export const cardMechanics: readonly (PromptMechanics | RuleMechanics)[] = [
  { id: 'three-word-day', kind: 'prompt' },
  { id: 'tiny-sales-pitch', kind: 'prompt' },
  { id: 'unpopular-snack', kind: 'prompt' },
  { id: 'soundtrack', kind: 'prompt' },
  { id: 'bad-superpower', kind: 'prompt' },
  { id: 'two-second-logo', kind: 'prompt' },
  { id: 'imaginary-holiday', kind: 'prompt' },
  { id: 'table-awards', kind: 'prompt' },
  { id: 'odd-one-out', kind: 'prompt' },
  { id: 'five-things', kind: 'prompt' },
  { id: 'backwards-introduction', kind: 'prompt' },
  { id: 'mystery-object', kind: 'prompt' },
  { id: 'group-photo-title', kind: 'prompt' },
  { id: 'tiny-debate', kind: 'prompt' },
  { id: 'holiday-planner', kind: 'prompt' },
  { id: 'silent-movie', kind: 'prompt' },
  { id: 'table-telepathy', kind: 'prompt' },
  { id: 'museum-piece', kind: 'prompt' },
  { id: 'new-constellation', kind: 'prompt' },
  { id: 'restaurant-review', kind: 'prompt' },
  { id: 'animal-interview', kind: 'prompt' },
  { id: 'one-word-story', kind: 'prompt' },
  { id: 'terrible-invention', kind: 'prompt' },
  { id: 'time-traveller', kind: 'prompt' },
  { id: 'fake-fact', kind: 'prompt' },
  { id: 'perfect-pair', kind: 'prompt' },
  { id: 'mini-mime', kind: 'prompt' },
  { id: 'opening-credits', kind: 'prompt' },
  { id: 'weather-report', kind: 'prompt' },
  { id: 'first-impression', kind: 'prompt' },
  { id: 'rhythm-copy', kind: 'prompt' },
  { id: 'shared-toast', kind: 'prompt' },
  {
    id: 'royal-requests',
    kind: 'temporary-rule',
    target: 'everyone',
    duration: { amount: 1, unit: 'circles' },
  },
  {
    id: 'third-person',
    kind: 'temporary-rule',
    target: 'choose-player',
    duration: { amount: 1, unit: 'circles' },
  },
  {
    id: 'news-anchor',
    kind: 'temporary-rule',
    target: 'current-player',
    duration: { amount: 1, unit: 'circles' },
  },
  {
    id: 'question-time',
    kind: 'temporary-rule',
    target: 'current-player',
    duration: { amount: 3, unit: 'turns' },
  },
  {
    id: 'invisible-microphone',
    kind: 'temporary-rule',
    target: 'everyone',
    duration: { amount: 1, unit: 'circles' },
  },
  {
    id: 'dramatic-pause',
    kind: 'temporary-rule',
    target: 'choose-player',
    duration: { amount: 3, unit: 'turns' },
  },
  {
    id: 'round-of-applause',
    kind: 'temporary-rule',
    target: 'everyone',
    duration: { amount: 1, unit: 'circles' },
  },
  {
    id: 'imaginary-hat',
    kind: 'temporary-rule',
    target: 'choose-player',
    duration: { amount: 1, unit: 'circles' },
  },
  { id: 'last-call', kind: 'special' },
  { id: 'captains-choice', kind: 'special' },
]
